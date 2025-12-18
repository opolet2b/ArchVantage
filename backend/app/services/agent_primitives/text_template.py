"""
Text Template Primitive (Markdown Generator Node)

Semantic processing engine that ingests raw text and restructures it
into valid Markdown using an LLM guided by a template file.

Features:
- Preserves YAML frontmatter (styling metadata) unchanged
- Fills <!-- INSTRUCTION: --> blocks using LLM
- Supports image placement and table formatting
"""
from typing import Any, Dict, Tuple
import re
from jinja2 import Environment, BaseLoader, UndefinedError
from app.services.agent_primitives.base import BasePrimitive, PrimitiveResult


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
            try:
                template_obj = db.query(Template).filter(
                    Template.id == template_id
                ).first()
                if template_obj:
                    template_content = template_obj.content
                    # Update params with loaded content
                    params["template_content"] = template_content
                else:
                    return PrimitiveResult(
                        success=False,
                        error=f"Template not found: {template_id}"
                    )
            finally:
                db.close()
        
        # Validate that a template is provided
        if not template_content:
            return PrimitiveResult(
                success=False,
                error="No template selected. Please select a template from the Template selector in the node configuration."
            )
        
        # Determine execution mode
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
            all_variables = {**state.get("variables", {}), **extra_variables}
            
            # Also include secrets (they should be decrypted already)
            all_variables["secrets"] = state.get("secrets", {})
            
            # Create Jinja2 environment with sandboxed settings
            env = Environment(
                loader=BaseLoader(),
                autoescape=True  # Auto-escape for security
            )
            
            # Render the template
            template = env.from_string(template_string)
            result = template.render(**all_variables)
            
            return PrimitiveResult(
                success=True,
                output={
                    output_var: result,
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
            llm_model = params.get("llm_model", "default")
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
                
                if auto_input:
                    source_text = auto_input if isinstance(auto_input, str) else str(auto_input)
                else:
                    source_text = ""
            else:
                # Normal variable resolution for {{variable}} syntax
                source_text = self.resolve_variables(source_text_raw, state)
            
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
            
            # Step 1: Parse template - separate YAML frontmatter from body
            frontmatter, body_template = self._parse_template(template_content)
            
            # Step 2: Construct LLM prompt
            system_prompt = """You are a document restructuring assistant.
Your task is to replace the <!-- INSTRUCTION: --> blocks in the provided 
markdown structure with content derived from the Input Text.

Rules:
1. Keep all standard markdown formatting (#, -, >, |) exactly as they appear.
2. Replace each <!-- INSTRUCTION: ... --> block with appropriate content.
3. If no data is available for a section, insert "[No data available for this section]".
4. If the input contains image URLs, place them using ![Alt Text](URL) where relevant.
5. Format tabular data using standard markdown tables.
6. DO NOT modify or output any YAML frontmatter - only work with the markdown body."""
            
            user_message = (
                f"## Markdown Template:\n{body_template}\n\n"
                f"## Input Text:\n{source_text}"
            )
            
            # Check for potential context window issues (rough estimate)
            total_chars = len(system_prompt) + len(user_message)
            # Approximate 4 chars per token, 8000 token limit as safety margin
            if total_chars > 32000:
                return PrimitiveResult(
                    success=False,
                    error=(
                        "InputTooLarge: Combined input exceeds safe context "
                        "window. Please reduce source text or template size."
                    )
                )
            
            # Step 3: Call LLM
            messages = [
                Message(role="system", content=system_prompt),
                Message(role="user", content=user_message)
            ]
            
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
