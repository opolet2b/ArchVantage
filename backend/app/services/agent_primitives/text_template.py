"""
Text Template Primitive (Markdown Generator Node)

Semantic processing engine that ingests raw text and restructures it
into valid Markdown using an LLM guided by a template file.

Features:
- Preserves YAML frontmatter (styling metadata) unchanged
- Fills <!-- INSTRUCTION: --> blocks using LLM
- Supports image placement and table formatting
"""
import logging
import json
import re
import time
from typing import List, Dict, Any, Optional, Tuple
from datetime import datetime
from jinja2 import Environment, BaseLoader, UndefinedError
from app.services.agent_primitives.base import BasePrimitive, PrimitiveResult
from app.schemas.canvas_schemas import VisualizerOutput


class TextTemplatePrimitive(BasePrimitive):
    """
    Markdown Generator Node (Component 1).
    
    Ingests source text and a markdown template, uses an LLM to fill
    instruction blocks, and outputs complete generated markdown with
    preserved YAML frontmatter.
    """
    
    @property
    def name(self) -> str:
        """Return the primitive type name."""
        return "TEXT_TEMPLATE"
    
    @property
    def description(self) -> str:
        """Return a description of what this primitive does."""
        return (
            "Markdown Generator: Restructures raw text into formatted "
            "markdown using an LLM guided by a template."
        )
    
    @property
    def param_schema(self) -> Dict[str, Any]:
        """Return JSON Schema for the primitive's parameters."""
        return {
            "type": "object",
            "properties": {
                "source_text": {
                    "type": "string",
                    "description": (
                        "Raw content to be processed (extracted text, "
                        "OCR results, etc.) or variable reference {{var}}"
                    )
                },
                "template_id": {
                    "type": "string",
                    "description": "Template ID to load from database"
                },
                "template_name": {
                    "type": "string",
                    "description": "Template name (for display only)"
                },
                "template_content": {
                    "type": "string",
                    "description": (
                        "Markdown template with optional YAML frontmatter "
                        "and <!-- INSTRUCTION: --> blocks (legacy fallback)"
                    )
                },
                "llm_model": {
                    "type": "string",
                    "description": "LLM preset name from settings",
                    "default": "default"
                },
                "output_variable": {
                    "type": "string",
                    "description": "Variable name to store the generated markdown",
                    "default": "generated_markdown"
                },
                # Legacy support for simple Jinja2 mode
                "template_string": {
                    "type": "string",
                    "description": "Legacy: Simple Jinja2 template string"
                },
                "mode": {
                    "type": "string",
                    "enum": ["simple", "semantic"],
                    "description": (
                        "Processing mode: 'simple' for Jinja2-only, "
                        "'semantic' for LLM-based markdown generation"
                    ),
                    "default": "semantic"
                }
            },
            "required": []
        }
    
    async def execute(
        self, 
        params: Dict[str, Any], 
        state: Dict[str, Any]
    ) -> PrimitiveResult:
        """
        Execute the text template primitive.
        
        Supports two modes:
        - simple: Basic Jinja2 template rendering (legacy)
        - semantic: LLM-based markdown generation with template guidance
        """
        # Load template from database if template_id is provided
        template_content = params.get("template_content")
        template_id = params.get("template_id")
        
        if template_id and not template_content:
            # Import here to avoid circular dependencies
            from app.models.template import Template
            from app.core.database import SessionLocal
            
            db = SessionLocal()
            # Load Template from DB if ID provided
            template_id = params.get("template_id")

            # --- DEBUG LOGGING ---
            print(f"\n[TEMPLATE_DEBUG] TextTemplate Execution Started")
            print(f"[TEMPLATE_DEBUG] Received template_id: {template_id}")
            print(f"[TEMPLATE_DEBUG] Received template_name: {params.get('template_name')}")
            # ---------------------
            
            if template_id:
                try:
                    from app.models.smart_template import SmartTemplateDocumentSection
                    from app.core.database import SessionLocal
                    
                    db = SessionLocal()
                    try:
                        template_obj = db.query(Template).filter(
                            Template.id == template_id
                        ).first()
                        if template_obj:
                            template_content = template_obj.content
                            # Update params with loaded content
                            params["template_content"] = template_content
                            print(f"[TEMPLATE_DEBUG] SUCCESS: Loaded template from 'Template' table.")
                        else:
                            # Try finding by section ID (common usage for Smart Analysis)
                            section = db.query(SmartTemplateDocumentSection).filter(SmartTemplateDocumentSection.id == template_id).first()
                            if section:
                                template_content = section.content_template
                                print(f"[TextTemplate] Loaded template from section: {section.name}")
                                print(f"[TEMPLATE_DEBUG] SUCCESS: Loaded template '{section.name}' from Section table.")
                            else:
                                print(f"[TextTemplate] Template ID {template_id} not found.") 
                                print(f"[TEMPLATE_DEBUG] WARNING: Template ID {template_id} NOT found in DB.")
                                return PrimitiveResult(
                                    success=False,
                                    error=f"Template not found: {template_id}"
                                )
                    finally:
                        db.close()
                except Exception as e:
                     print(f"[TextTemplate] Error loading template: {e}")
            
            # If no ID, but content provided in params (rare but possible)
            if not template_content and params.get("template_content"):
                 template_content = params.get("template_content")
        
        # Resolve Rendering Type to Template if provided (and no direct template content)
        rendering_type_id = params.get("renderingType")
        if rendering_type_id and not template_content:
            try:
                from app.models.smart_template import SmartRenderingType
                from app.core.database import SessionLocal
                
                db = SessionLocal()
                try:
                    rt = db.query(SmartRenderingType).filter(SmartRenderingType.id == rendering_type_id).first()
                    if rt:
                        print(f"[TextTemplate] Resolved Rendering Type: {rt.name}")
                        
                        # Store metadata for strict mode
                        if hasattr(rt, "react_component") and rt.react_component:
                             params["react_component"] = rt.react_component
                        if hasattr(rt, "config_schema") and rt.config_schema:
                             params["config_schema"] = rt.config_schema
                             
                        if "Executive Summary" in rt.name:
                            template_content = (
                                "## Executive Summary\n\n"
                                "<!-- INSTRUCTION: Provide a high-level executive summary of the analyzed content. Focus on key strategic insights, risks, and opportunities. Keep it concise and professional. -->\n\n"
                                "### Key Findings\n"
                                "{{ findings | default('No findings generated.') }}\n\n"
                                "### Recommendations\n"
                                "{{ recommendations | default('No recommendations provided.') }}\n"
                            )
                            # Update params with resolved content
                            params["template_content"] = template_content
                        elif "Detailed Report" in rt.name:
                            template_content = (
                                "## Detailed Analysis Report\n\n"
                                "### Overview\n<!-- INSTRUCTION: Provide a comprehensive overview of the document. -->\n\n"
                                "### In-Depth Analysis\n<!-- INSTRUCTION: Analyze the content in detail, breaking it down by themes or sections. -->\n\n"
                                "### Conclusion\n<!-- INSTRUCTION: Summarize the main conclusions and implications. -->"
                            )
                        elif "Bullet Points" in rt.name or "List" in rt.name:
                            template_content = (
                                "## Key Points\n\n"
                                "<!-- INSTRUCTION: Extract and list the main points from the text as a bulleted list. -->"
                            )
                        else:
                            # Generic fallback for known rendering type but unknown template
                            template_content = (
                                f"## {rt.name}\n\n"
                                f"<!-- INSTRUCTION: Format the content as a {rt.name}. -->"
                            )
                        # Construct a mock frontmatter if needed or just use content
                        params["template_content"] = template_content
                finally:
                    db.close()
            except Exception as e:
                print(f"[TextTemplate] Error resolving rendering type: {e}")

            # Validate: Template check
            is_fallback = False
            if not template_content.strip():
                print("[TextTemplate] Warning: No template content provided. Using fallback generic template.")
                template_content = (
                    "## Analysis Report\n\n"
                    "The following content was generated based on the input:\n\n"
                    "<!-- INSTRUCTION: Summarize the input text and present the key findings in a clear, structured format. -->"
                )
                is_fallback = True
                # Update params so _execute_semantic can use it
                params["template_content"] = template_content
                
            # SMART PASS-THROUGH (The "Auditor" Logic)
            # If we are using the generic fallback template, AND the input source_text 
            # already looks like a structured Markdown report (has headers), 
            # then we should NOT re-summarize it. We should assume the previous agent 
            # (Step 1) did the job conformantly.
            if is_fallback and source_text and ("## " in source_text or "# " in source_text):
                 print(f"[TextTemplate] Passthrough: Input seems to be pre-formatted Markdown (length {len(source_text)}). Skipping generic summarization.")
                 return PrimitiveResult(
                     success=True,
                     output={
                         "formatted_text": source_text,
                         "markdown": source_text,
                         "_raw": source_text
                     }
                 )
                
            if not template_content.strip():
                return PrimitiveResult(
                    success=False,
                    error="InvalidTemplate: Template content cannot be empty"
                )
                
            print(f"[TEMPLATE_DEBUG] Final Template Content Preview: {template_content[:100]}...")
            print(f"[TEMPLATE_DEBUG] Is Fallback Template: {is_fallback}")
            
        mode = params.get("mode", "semantic")
        
        # Backward compatibility: if template_string exists, use simple mode
        if params.get("template_string"):
            mode = "simple"
        
        if mode == "simple":
            return await self._execute_simple(params, state)
        else:
            return await self._execute_semantic(params, state)
    
    async def _execute_simple(
        self, 
        params: Dict[str, Any], 
        state: Dict[str, Any]
    ) -> PrimitiveResult:
        """
        Legacy Jinja2 template rendering mode.
        
        Renders a Jinja2 template string with variables from state.
        """
        try:
            template_string = params.get("template_string", "")
            extra_variables = params.get("variables", {})
            output_var = params.get("output_variable", "formatted_text")
            
            # Merge state variables with extra variables
            raw_vars = {**state.get("variables", {}), **extra_variables}
            # Sanitize keys for Jinja (must be strings)
            all_variables = {str(k): v for k, v in raw_vars.items()}
            # Inject Debug Keys for diagnosing missing variables
            all_variables["_debug_keys"] = list(all_variables.keys())
            
            # Also include secrets (they should be decrypted already)
            all_variables["secrets"] = state.get("secrets", {})
            
            # Create Jinja2 environment with sandboxed settings
            # IMPORTANT: autoescape=False for markdown content (we don't want HTML escaping)
            env = Environment(
                loader=BaseLoader(),
                autoescape=False  # Disable escaping for markdown content
            )
            
            # Render the template
            template = env.from_string(template_string)
            result = template.render(**all_variables)
            
            # DEBUG: Log aggregator template details
            print(f"[TEXT_TEMPLATE SIMPLE] Template String: {template_string[:200]}...")
            print(f"[TEXT_TEMPLATE SIMPLE] Variable Keys: {list(all_variables.keys())[:10]}...")
            print(f"[TEXT_TEMPLATE SIMPLE] Result Length: {len(result)}")
            print(f"[TEXT_TEMPLATE SIMPLE] Result Preview: {result[:300]}...")
            
            # DEBUG: Save detailed variable info to file
            try:
                debug_dir = "C:/Users/opole/Downloads/ChatBotn/backend/debug_docs"
                import os
                os.makedirs(debug_dir, exist_ok=True)
                
                # CLEAN DEBUG OUTPUT
                with open(f"{debug_dir}/AGGREGATOR_READABLE.md", "w", encoding="utf-8") as f:
                    f.write(f"# Aggregator Debug Report\n\n")
                    f.write(f"## Template String (What Jinja2 Rendered)\n")
                    f.write(f"```\n{template_string}\n```\n\n")
                    
                    f.write(f"## Section Variable Contents\n\n")
                    for k, v in all_variables.items():
                        # Only show node_ variables (the section outputs)
                        if k.startswith("node_"):
                            f.write(f"### Variable: `{k}`\n\n")
                            if isinstance(v, dict):
                                gm = v.get('generated_markdown', v.get('text', ''))
                                if gm:
                                    # Show first 500 chars
                                    preview = gm[:500] if len(gm) > 500 else gm
                                    f.write(f"**Content Preview:**\n```markdown\n{preview}\n```\n\n")
                                    f.write(f"**Full Length:** {len(gm)} chars\n\n")
                                else:
                                    f.write(f"**Warning:** No generated_markdown or text key found. Keys: {list(v.keys())}\n\n")
                            else:
                                f.write(f"**Type:** {type(v).__name__} (expected dict)\n\n")
                    
                    f.write(f"## Final Rendered Result\n\n")
                    f.write(f"**Total Length:** {len(result)} chars\n\n")
                    f.write(f"```markdown\n{result[:2000]}{'...(truncated)' if len(result) > 2000 else ''}\n```\n")
                
                print(f"[TEXT_TEMPLATE SIMPLE] DEBUG: Saved readable report to {debug_dir}/AGGREGATOR_READABLE.md")
            except Exception as e:
                print(f"[TEXT_TEMPLATE SIMPLE] DEBUG: Failed to save vars: {e}")
            
            return PrimitiveResult(
                success=True,
                output={
                    output_var: result,
                    "generated_markdown": result,  # Also include as generated_markdown for compatibility
                    "text": result,  # Also include as text for compatibility
                    "status": "SUCCESS",
                    "_raw": result
                }
            )
            
        except UndefinedError as e:
            return PrimitiveResult(
                success=False,
                error=f"Template variable not found: {str(e)}"
            )
        except Exception as e:
            return PrimitiveResult(
                success=False,
                error=f"Template rendering failed: {str(e)}"
            )
    
    async def _execute_semantic(
        self, 
        params: Dict[str, Any], 
        state: Dict[str, Any]
    ) -> PrimitiveResult:
        """
        LLM-based markdown generation mode.
        
        Execution flow:
        1. Parse template - separate YAML frontmatter from body
        2. Send body + source text to LLM with restructuring prompt
        3. Reassemble frontmatter + filled body
        4. Return complete markdown
        """
        try:
            # Import LLM service
            from app.services.llm_service import llm_service
            from app.models.chat import Message
            
            # Get parameters
            source_text_raw = params.get("source_text", "")
            template_content = params.get("template_content", "")
            # Retrieve model preference (Global > Param > Default)
            variables = state.get("variables", {})
            llm_model = variables.get("model") or params.get("llm_model", "default")
            
            print(f"[TextTemplate] Using Model: {llm_model}")
            output_var = params.get("output_variable", "generated_markdown")
            
            # Auto-detect input if source_text is empty
            if not source_text_raw or not source_text_raw.strip():
                # Try common input field names from JSON_MAPPING
                variables = state.get("variables", {})
                auto_input = None
                
                # First, try top-level variables
                auto_input = (
                    variables.get("context") or 
                    variables.get("source_text") or 
                    variables.get("input") or 
                    variables.get("text")
                )
                
                # If not found, check inside common container variables (JSON_MAPPING output)
                if not auto_input:
                    for container_key in ["result", "mapped_data", "output"]:
                        container = variables.get(container_key)
                        if isinstance(container, dict):
                            auto_input = (
                                container.get("context") or
                                container.get("source_text") or
                                container.get("input") or
                                container.get("text")
                            )
                            if auto_input:
                                break
                
                # If still not found, check current_output from previous node
                if not auto_input:
                    current_output = state.get("current_output")
                    if current_output:
                        if isinstance(current_output, dict):
                            # Smart Extraction: Look for content keys
                            priority_keys = [
                                "combined_context", "text", "content", "result", "output", 
                                "llm_output", "generated_markdown", "report", "summary"
                            ]
                            found_content = None
                            for key in priority_keys:
                                if key in current_output and isinstance(current_output[key], str) and current_output[key].strip():
                                    found_content = current_output[key]
                                    break
                            
                            if found_content:
                                auto_input = found_content
                            else:
                                # Fallback to string dump of dict
                                auto_input = str(current_output)
                        else:
                            # It's a primitive value (str, etc)
                            auto_input = current_output

                if auto_input:
                    source_text = auto_input if isinstance(auto_input, str) else str(auto_input)
                else:
                    source_text = ""

            else:
                # Normal variable resolution for {{variable}} syntax
                source_text = self.resolve_variables(source_text_raw, state)

            # Resolve Rendering Type to Template if provided
            rendering_type_id = params.get("renderingType")
            if rendering_type_id and not template_content:
                try:
                    from app.models.smart_template import SmartRenderingType
                    from app.core.database import SessionLocal
                    
                    db = SessionLocal()
                    try:
                        rt = db.query(SmartRenderingType).filter(SmartRenderingType.id == rendering_type_id).first()
                        if rt:
                            print(f"[TextTemplate] Resolved Rendering Type: {rt.name}")
                            if "Executive Summary" in rt.name:
                                template_content = (
                                    "## Executive Summary\n\n"
                                    "<!-- INSTRUCTION: Provide a high-level executive summary of the analyzed content. Focus on key strategic insights, risks, and opportunities. Keep it concise and professional. -->\n\n"
                                    "### Key Findings\n"
                                    "<!-- INSTRUCTION: List the top 3-5 most critical findings. -->"
                                )
                            elif "Detailed Report" in rt.name:
                                template_content = (
                                    "## Detailed Analysis Report\n\n"
                                    "### Overview\n<!-- INSTRUCTION: Provide a comprehensive overview of the document. -->\n\n"
                                    "### In-Depth Analysis\n<!-- INSTRUCTION: Analyze the content in detail, breaking it down by themes or sections. -->\n\n"
                                    "### Conclusion\n<!-- INSTRUCTION: Summarize the main conclusions and implications. -->"
                                )
                            elif "Bullet Points" in rt.name or "List" in rt.name:
                                template_content = (
                                    "## Key Points\n\n"
                                    "<!-- INSTRUCTION: Extract and list the main points from the text as a bulleted list. -->"
                                )
                            else:
                                # Generic fallback for known rendering type but unknown template
                                template_content = (
                                    f"## {rt.name}\n\n"
                                    f"<!-- INSTRUCTION: Format the content as a {rt.name}. -->"
                                )
                    finally:
                        db.close()
                except Exception as e:
                    print(f"[TextTemplate] Error resolving rendering type: {e}")
            
            # Validate: Empty input check
            if not source_text.strip():
                return PrimitiveResult(
                    success=False,
                    error="EmptyInput: Source text cannot be empty. Either set the 'source_text' parameter or ensure a 'context', 'source_text', 'input', or 'text' variable exists in the workflow state."
                )
            
            # Validate: Template check
            if not template_content.strip():
                return PrimitiveResult(
                    success=False,
                    error="InvalidTemplate: Template content cannot be empty"
                )
            
            # STRICT CONTRACT MODE
            # Check if we have 'agent_output' from previous node
            variables = state.get("variables", {})
            agent_out = variables.get("agent_output") or variables.get("extractor_output")
            
            print(f"[TextTemplate] Debug: checking for agent_output. Keys in variables: {list(variables.keys())}")
            if agent_out:
                print(f"[TextTemplate] Found agent_output. Type: {type(agent_out)}")
                if isinstance(agent_out, dict):
                     print(f"[TextTemplate] agent_output keys: {list(agent_out.keys())}")
            else:
                print(f"[TextTemplate] agent_output NOT found in variables.")
                
            if agent_out:
                try:
                    # STRICT CONTRACT MODE CHECK
                    # Only enter if we are NOT doing a standard text restructuring task
                    # FIX: Use explicit context flag if available, fallback to content check
                    variables = state.get("variables", {})
                    explicit_is_doc = variables.get("is_document_template")
            
                    if explicit_is_doc is not None:
                        is_document_template = explicit_is_doc
                        print(f"[TEXT_TEMPL] Using explicit 'is_document_template' flag: {is_document_template}")
                    else:
                        is_document_template = "<!-- INSTRUCTION" in template_content
                
                    is_visualizer_component = bool(params.get("react_component") or params.get("config_schema"))
                    
                    # We enter strict mode ONLY if:
                    # 1. It is explicitly a visualizer component (Charts, etc)
                    # 2. OR it is NOT a document template (no instructions found)
                    use_strict_mode = is_visualizer_component or not is_document_template
                    
                    if not use_strict_mode:
                        print(f"[TextTemplate] Bypass Strict Mode: Document Template detected. treating agent_output as source_text.")
                        # Ensure source_text is populated for the standard path below
                        if not source_text or not source_text.strip():
                             source_text = agent_out if isinstance(agent_out, str) else str(agent_out)
                    
                    if use_strict_mode:
                        from app.schemas.smart_contracts import VisualizerOutput, VisualPayload
                        print(f"[TextTemplate] Strict Mode detected. Using VisualizerOutput schema.")
                    
                    # 0. Pre-render Template with Jinja2 if variables map nicely
                    # This allows {{ findings }} to be resolved from agent_output directly
                    try:
                        from jinja2 import Environment, BaseLoader
                        env = Environment(loader=BaseLoader(), autoescape=False) # Markdown safe
                        tmpl = env.from_string(template_content)
                        
                        # Flatten agent_output for template context
                        # exposing 'findings', 'recommendations' etc directly
                        if isinstance(agent_out, dict):
                             render_context = {**state.get("variables", {}), **agent_out}
                        else:
                             # If output is string (fallback), exposes it as 'agent_output'
                             render_context = {**state.get("variables", {}), "agent_output": agent_out}
                        
                        # Sanitize keys for Jinja kwargs
                        render_context = {str(k): v for k, v in render_context.items()}
                        
                        # Attempt render
                        # We use a broad context so {{ findings }} works if findings is in agent_out
                        pre_rendered_content = tmpl.render(**render_context)
                        
                        # Use the pre-rendered content as the instruction/template
                        # This ensures the LLM sees the populated data, not just the tags
                        template_for_prompt = pre_rendered_content
                        print(f"[TextTemplate] Pre-rendered template with agent data.")
                    except Exception as jinja_error:
                         print(f"[TextTemplate] Jinja pre-render failed: {jinja_error}. Using raw template.")
                         template_for_prompt = template_content

                    # Construct System Prompt with Output Schema
                    schema_str = json.dumps(VisualizerOutput.model_json_schema(), indent=2)
                    
                    # Customize prompt for Chart/Component mode
                    react_component = params.get("react_component")
                    config_schema = params.get("config_schema")

                    if react_component:
                         # Improve terminology for LLM
                         component_name = react_component
                         target_structure_type = "chart" # Fallback/Default
                         
                         if "redcharts" in react_component.lower():
                             component_name = "Recharts LineChart"
                             target_structure_type = "chart"
                         
                         # SCHEMA HANDLING
                         schema_desc = "No specific schema provided."
                         example_desc = ""
                         
                         if config_schema:
                             # Check if it's a raw string (e.g. JS code) or actual JSON object/dict
                             if isinstance(config_schema, str) and ("const" in config_schema or "=" in config_schema or "[" in config_schema) and not config_schema.strip().startswith("{"):
                                 # User provided JS Code/Example Data
                                 schema_desc = "Schema: See Example Data below."
                                 example_desc = f"REFERENCE DATA STRUCTURE (Javascript):\n{config_schema}\n\nINSTRUCTION: Output JSON that matches the structure and keys of the reference data above."
                             else:
                                 # Standard JSON Schema (Dict or JSON String)
                                 schema_json = config_schema
                                 if isinstance(config_schema, str):
                                     try:
                                         schema_json = json.loads(config_schema)
                                     except:
                                         schema_json = {"error": "Invalid JSON Schema string"}
                                 
                                 schema_desc = json.dumps(schema_json, indent=2)
                                 example_desc = "INSTRUCTION: Your output 'content' MUST be a valid JSON object that strictly conforms to the JSON Schema above."

                         context_instruction = (
                             f"TARGET VISUALIZATION: '{component_name}'\n"
                             f"You must generate a valid JSON payload for this React component.\n"
                             f"Set 'structure_type' to '{target_structure_type}'.\n"
                             f"The 'content' field must be a JSON object conforming to this schema:\n{schema_desc}\n"
                             f"{example_desc}\n"
                         )
                         
                         if "recharts" in component_name.lower():
                             context_instruction += (
                                 "\nIMPORTANT DATA TRANSFORMATION STRATEGY:\n"
                                 "The Input Analysis Results likely contain a 'flat' dictionary with keys combining Entity, Time, and Metric (e.g. 'Euro_Area_Q1_2025_Growth').\n"
                                 "You MUST pivot this data into an Array of Objects suitable for a Time-Series Chart.\n"
                                 "1. Identify the common 'Time' or 'Category' across the keys (e.g. Q1 2025, Q2 2025).\n"
                                 "2. Create one object for each Time/Category: {'name': 'Q1 2025'}.\n"
                                 "3. Extract the numeric values for each Entity at that time and add them to the object.\n"
                                 "   Example Goal: [{'name': 'Q1 2025', 'Euro Area': 1.3, 'EU': 1.2}, ...]\n"
                             )
                         
                         # OVERRIDE: Ignore any generic template instructions that might suggest ASCII art
                         template_for_prompt = (
                             f"Task: Extract data from the analysis results to populate a {component_name}.\n"
                             f"Strictly follow the JSON schema provided in the system prompt.\n"
                             f"Do not generate markdown text or ASCII charts."
                         )
                    else:
                         context_instruction = (
                             "1. 'structure_type' should be 'markdown' for reports, 'mermaid' for diagrams.\n"
                             "2. 'content' must contain the actual string payload (e.g. the full markdown text or mermaid code).\n"
                         )

                    system_prompt = f"""You are a data visualization assistant.
Your task is to transform the provided Analysis Results into a visual structure.

Output Schema:
{schema_str}

Specific Instructions:
{context_instruction}
3. If 'formatted_output' is present in the analysis results, it contains the FINAL pre-formatted report.
   CRITICAL: You MUST use this `formatted_output` string EXACTLY as provided for the `content` field.
   - Do NOT rewrite it.
   - Do NOT summarize it.
   - Do NOT change the headers.
   - The user has already approved this specific format. Just wrap it in the JSON structure.
4. Do not omit any findings from the analysis.
5. If the provided Analysis Results are empty, missing, or do not contain enough information to populate the requested structure, set the 'content' field to a friendly, helpful explanation in Markdown (e.g., 'No numeric figures found in the selected cells. Please ensure you have selected data for analysis.').
"""
                    user_message_content = f"Analysis Results:\n{json.dumps(agent_out, indent=2)}\n\nTemplate/Instructions:\n{template_for_prompt}"
                    
                    messages = [
                        Message(role="system", content=system_prompt),
                        Message(role="user", content=user_message_content)
                    ]
                    
                    # --- DEBUG LOGGING ---
                    try:
                        with open("execution_debug.log", "a", encoding="utf-8") as f:
                            from datetime import datetime
                            f.write(f"\n[{datetime.utcnow().isoformat()}] [TEXT_TEMPLATE VISUALIZER PROMPT]\n")
                            for m in messages:
                                f.write(f"ROLE: {m.role}\nCONTENT:\n{m.content}\n---\n")
                            f.write("="*50 + "\n")
                    except Exception as log_e:
                         print(f"Logging failed: {log_e}")
                    # Step 4: Execute with LLM
                    start_time = time.time()
                    # In strict mode, summarization_needed is effectively false due to MAX_SAFE_CHARS bypass
                    start_time = time.time()
                    print(f"[TextTemplate] executing Single-Shot Semantic Generation (Strict Mode) at {start_time}")
                    
                    chat_kwargs = {
                        "messages": messages, 
                        "model_name": llm_model,
                        "temperature": 0.7
                    }
                    
                    # Pass status callbacks if available
                    status_callbacks = state.get("status_callbacks", [])
                    if status_callbacks:
                        chat_kwargs["callbacks"] = status_callbacks
                        
                        # Send initial status
                        for cb in status_callbacks:
                            try:
                                msg = f"Generating visual '{component_name or 'content'}'..."
                                import asyncio
                                if asyncio.iscoroutinefunction(cb):
                                    await cb(msg)
                                else:
                                    cb(msg)
                            except: pass

                    response_text = await llm_service.chat(**chat_kwargs)
                    
                    end_time = time.time()
                    duration = end_time - start_time
                    print(f"[TextTemplate] LLM Generation Finished. Duration: {duration:.2f} seconds ({duration/60:.2f} minutes).")
                    
                    # Fix: Strip Markdown Fences if present (common with Flash/Smart models despite Strict Mode)
                    clean_text = response_text.strip()
                    if clean_text.startswith("```json"):
                        clean_text = clean_text[7:]
                    if clean_text.startswith("```"):
                        clean_text = clean_text[3:]
                    if clean_text.endswith("```"):
                        clean_text = clean_text[:-3]
                    clean_text = clean_text.strip()
                    print(f"[TextTemplate] Cleaned Text: {clean_text[:50]}...")

                    try:
                        viz_output_data = json.loads(clean_text, strict=False)
                    except json.JSONDecodeError:
                        # Fallback 1: Regex text search
                        # re is imported globally
                        match = re.search(r'\{.*\}', clean_text, re.DOTALL)
                        if match:
                            try:
                                viz_output_data = json.loads(match.group(0))
                            except:
                                import ast
                                try:
                                    viz_output_data = ast.literal_eval(match.group(0))
                                except:
                                     raise ValueError(f"Could not parse JSON. Raw: {clean_text[:100]}")
                        else:
                             raise ValueError(f"No JSON block found. Raw: {clean_text[:100]}")
                    
                    # Validate content presence
                    if "visual_payload" not in viz_output_data:
                         # Heuristic: Unwrap common LLM wrappers
                         content_to_wrap = viz_output_data
                         
                         # 1. extracted_elements array (Common in extraction tasks)
                         if isinstance(viz_output_data, dict):
                             if "extracted_elements" in viz_output_data and isinstance(viz_output_data["extracted_elements"], list):
                                 elements = viz_output_data["extracted_elements"]
                                 # Flatten if it's a list of objects with 'data' (User's specific case)
                                 # Case: [{ ..., "data": [...] }]
                                 flat_data = []
                                 for el in elements:
                                     if isinstance(el, dict) and "data" in el and isinstance(el["data"], list):
                                         flat_data.extend(el["data"])
                                     else:
                                         flat_data.append(el)
                                 
                                 if flat_data:
                                     content_to_wrap = flat_data
                                     print(f"[TextTemplate] Unwrapped 'extracted_elements' ({len(flat_data)} items)")

                             elif "data" in viz_output_data and isinstance(viz_output_data["data"], list):
                                 content_to_wrap = viz_output_data["data"]
                                 print(f"[TextTemplate] Unwrapped 'data' key.")
                                 
                             elif "results" in viz_output_data and isinstance(viz_output_data["results"], list):
                                 content_to_wrap = viz_output_data["results"]
                                 print(f"[TextTemplate] Unwrapped 'results' key.")

                         # Heuristic: Did we get a direct component payload (e.g. Chart.js style or Recharts array)?
                         # If so, wrap it.
                         if isinstance(content_to_wrap, dict) and "type" in content_to_wrap and "data" in content_to_wrap:
                              # Handle Chart.js style fallback -> Wrap it
                              viz_output_data = {"visual_payload": {"structure_type": "chart", "content": content_to_wrap}}
                         elif isinstance(content_to_wrap, list):
                              # Direct Array -> Wrap it
                              viz_output_data = {"visual_payload": {"structure_type": "chart", "content": content_to_wrap}}
                         elif isinstance(content_to_wrap, dict) and "content" in content_to_wrap:
                              # Just missing wrapper
                              viz_output_data = {"visual_payload": {"structure_type": "markdown", "content": content_to_wrap["content"]}}
                         else:
                              # Blindly wrap whatever we got as content, aiming for best effort
                              viz_output_data = {"visual_payload": {"structure_type": "chart", "content": content_to_wrap}}

                    # Store strictly
                    if "variables" not in state: state["variables"] = {}
                    state["variables"]["visualizer_output"] = viz_output_data
                    
                    content_str = str(viz_output_data["visual_payload"]["content"])
                    if isinstance(viz_output_data["visual_payload"]["content"], (dict, list)):
                         content_str = json.dumps(viz_output_data["visual_payload"]["content"])
                    
                    return PrimitiveResult(
                        success=True,
                        output={
                            output_var: content_str, 
                            "visualizer_output": viz_output_data, 
                            "_raw": content_str 
                        }
                    )
                except Exception as e:
                    print(f"[TextTemplate] Strict mode failed: {e}. Falling back to standard generation.")

            # Step 1: Parse template - separate YAML frontmatter from body
            frontmatter, body_template = self._parse_template(template_content)
            
            # Helper: Format input info valid text to avoid "JSON Mimicry" by LLM
            def format_input(data: Any) -> str:
                if isinstance(data, dict) or isinstance(data, list):
                    try:
                        import yaml
                        # Convert JSON/Dict to YAML for cleaner LLM consumption
                        return yaml.dump(data, sort_keys=False, default_flow_style=False)
                    except ImportError:
                        # Fallback if yaml not installed
                        return json.dumps(data, indent=2)
                return str(data)

            formatted_source = format_input(source_text) if (isinstance(source_text, (dict, list)) or (isinstance(source_text, str) and source_text.strip().startswith("{"))) else source_text

            # Step 2: Construct LLM prompt
            system_prompt = """You are a document restructuring assistant.
Your task is to replace the <!-- INSTRUCTION: --> blocks in the provided 
markdown structure with content derived from the Input Text.

Rules:
1. Output ONLY valid Markdown. Do NOT output JSON.
2. Keep all standard markdown formatting (#, -, >, |) exactly as they appear.
3. Replace each <!-- INSTRUCTION: ... --> block with appropriate content.
4. If no data is available for a section, insert "[No data available for this section]".
5. If the input contains image URLs, place them using ![Alt Text](URL) where relevant.
6. Format tabular data using standard markdown tables.
7. DO NOT modify or output any YAML frontmatter - only work with the markdown body."""
            
            user_message = (
                f"## Markdown Template:\n{body_template}\n\n"
                f"## Input Text:\n{formatted_source}"
            )
            
            # Step 3: Handle Context Window Limits
            # Import config service to check dynamic window setting
            from app.services.config_service import config_service
            
            preset_config = config_service.get_preset_config(llm_model)
            token_limit = 4096 # Default safe fallback
            
            # Priority 1: User Config
            if preset_config and "context_window" in preset_config and preset_config["context_window"]:
                token_limit = int(preset_config["context_window"])
            else:
                # Priority 2: Intelligent Defaults based on Model Name
                model_lower = llm_model.lower()
                if any(x in model_lower for x in ["gpt-4", "claude-3", "gemini", "gpt-4-turbo", "o1-"]):
                    token_limit = 128000
                elif "16k" in model_lower:
                    token_limit = 16000
                elif "32k" in model_lower:
                    token_limit = 32000
                elif any(x in model_lower for x in ["gpt-3.5", "llama"]):
                    # Older standard
                    token_limit = 4096 
                
                print(f"[TextTemplate] No explicit context window found for {llm_model}. Using default: {token_limit}")
                
            MAX_SAFE_CHARS = int(token_limit * 3) # Approx 75% of window in chars (4 chars/token)
            
            # Calculate input size for decision making
            total_chars = len(system_prompt) + len(user_message)

            # CRITICAL BYPASS: If Strict Mode (agent_out) is active, output integrity is paramount.
            # We bypass summarization unless it's stupidly large (e.g. > 100k chars), assuming the User selected
            if agent_out:
                print(f"[TextTemplate] Strict Mode active. Bypassing summarization check. (Input: {total_chars} chars)")
                # Effective infinite limit for logic check, though physical API limit still applies
                MAX_SAFE_CHARS = 1000000 
            
            filled_body = ""
            
            total_chars = len(system_prompt) + len(user_message)
            
            if total_chars > MAX_SAFE_CHARS:
                print(f"[TextTemplate] Input ({total_chars} chars) exceeds context limit ({MAX_SAFE_CHARS} chars / {token_limit} tokens). Switching to Chunked Processing.")
                
                # 3a. Summarize Source Text in Chunks
                # We need to reduce source_text to something manageable.
                # Pass token_limit to helper. Use formatted_source for better splitting safety.
                summarized_context = await self._summarize_in_chunks(formatted_source, llm_model, token_limit)
                
                print(f"[TextTemplate] Chunked processing complete. Reduced context to {len(summarized_context)} chars.")
                
                # Re-construct message with summarized context
                user_message = (
                    f"## Markdown Template:\n{body_template}\n\n"
                    f"## Input Text (Summarized):\n{summarized_context}"
                )
                
                # Recalculate prompt
                messages = [
                    Message(role="system", content=system_prompt),
                    Message(role="user", content=user_message)
                ]
                
                # --- DEBUG LOGGING ---
                try:
                    with open("execution_debug.log", "a", encoding="utf-8") as f:
                        from datetime import datetime
                        f.write(f"\n[{datetime.utcnow().isoformat()}] [TEXT_TEMPLATE CHUNK PROMPT]\n")
                        for m in messages:
                            f.write(f"ROLE: {m.role}\nCONTENT:\n{m.content}\n---\n")
                        f.write("="*50 + "\n")
                except Exception as log_e:
                     print(f"Logging failed: {log_e}")
                # ---------------------
                
                filled_body = await llm_service.chat(messages, model_name=llm_model)
                
            else:
                # 3b. Direct Execution
                messages = [
                    Message(role="system", content=system_prompt),
                    Message(role="user", content=user_message)
                ]
                
                # --- DEBUG LOGGING ---
                try:
                    with open("execution_debug.log", "a", encoding="utf-8") as f:
                        from datetime import datetime
                        f.write(f"\n[{datetime.utcnow().isoformat()}] [TEXT_TEMPLATE DIRECT PROMPT]\n")
                        for m in messages:
                            f.write(f"ROLE: {m.role}\nCONTENT:\n{m.content}\n---\n")
                        f.write("="*50 + "\n")
                except Exception as log_e:
                     print(f"Logging failed: {log_e}")
                # ---------------------
                
                filled_body = await llm_service.chat(messages, model_name=llm_model)
            
            # Strip any reasoning/thinking tags from LLM response
            # Some LLMs include <think>...</think> blocks for reasoning
            filled_body = re.sub(r'<think>.*?</think>', '', filled_body, flags=re.DOTALL | re.IGNORECASE).strip()
            
            # Step 4: Reassemble - prepend frontmatter if it exists
            if frontmatter:
                generated_markdown = f"---\n{frontmatter}\n---\n\n{filled_body}"
            else:
                generated_markdown = filled_body
            
            # Step 5: Basic sanitization - check for unclosed code blocks
            status = "SUCCESS"
            if generated_markdown.count("```") % 2 != 0:
                status = "WARNING"  # Unclosed code block detected
            
            return PrimitiveResult(
                success=True,
                output={
                    output_var: generated_markdown,
                    "status": status,
                    "frontmatter": frontmatter,
                    "filled_body": filled_body,
                    "_raw": generated_markdown
                }
            )
            
        except Exception as e:
            return PrimitiveResult(
                success=False,
                error=f"Markdown generation failed: {str(e)}"
            )
    
    async def _summarize_in_chunks(self, text: str, model_name: str, token_limit: int = 4096) -> str:
        """
        Split text into chunks and summarize each to reduce context side.
        """
        from app.services.llm_service import llm_service
        from app.models.chat import Message
        
        # Calculate safe chunk size (approx 60% of context window in chars)
        CHUNK_SIZE = int(token_limit * 2.5) 
        if CHUNK_SIZE < 1000: CHUNK_SIZE = 1000 # Minimum sanity
        
        chunks = [text[i:i+CHUNK_SIZE] for i in range(0, len(text), CHUNK_SIZE)]
        
        summaries = []
        for i, chunk in enumerate(chunks):
            print(f"[TextTemplate] Summarizing chunk {i+1}/{len(chunks)}...")
            prompt = (
                "Summarize the following text segment, preserving key facts, dates, and names. "
                "Do not add interpretation, just compress the information:\n\n"
                f"{chunk}"
            )
            try:
                messages = [
                    Message(role="system", content="You are a precise summarizer."),
                    Message(role="user", content=prompt)
                ]
                summary = await llm_service.chat(messages, model_name=model_name)
                summaries.append(summary)
            except Exception as e:
                print(f"[TextTemplate] Error summarizing chunk {i}: {e}")
                summaries.append(f"[Error summarizing chunk {i}]")
        
        return "\n\n".join(summaries)
        
    def _parse_template(self, template: str) -> Tuple[str, str]:
        """
        Separate YAML frontmatter from markdown body.
        
        Args:
            template: Full template content
            
        Returns:
            Tuple of (frontmatter, body). Frontmatter is empty string
            if not present.
        """
        template = template.strip()
        
        # Check if template starts with YAML frontmatter delimiter
        if template.startswith("---"):
            # Find the closing delimiter
            # Split on '---' but only consider the first two occurrences
            parts = template.split("---", 2)
            
            if len(parts) >= 3:
                # parts[0] is empty (before first ---)
                # parts[1] is the YAML content
                # parts[2] is the markdown body
                frontmatter = parts[1].strip()
                body = parts[2].strip()
                return frontmatter, body
        
        # No frontmatter found - treat entire content as body
        return "", template
