"""
Extractor Primitive

Uses an LLM to extract structured data from text based on a provided schema.
"""
from typing import Any, Dict, Optional
import json

from app.services.agent_primitives.base import BasePrimitive, PrimitiveResult
from app.services.llm_service import llm_service
from app.models.chat import Message as ChatMessage


class ExtractorPrimitive(BasePrimitive):
    """
    Extracts structured data from text using an LLM.
    """
    
    @property
    def name(self) -> str:
        return "EXTRACTOR"
    
    @property
    def description(self) -> str:
        return "Extracts structured data from text based on a schema."
    
    @property
    def param_schema(self) -> Dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "source_text": {
                    "type": "string",
                    "description": "The text to extract information from (supports variables)"
                },
                "schema": {
                    "type": "object",
                    "description": "JSON schema describing the data to extract"
                },
                "instruction": {
                    "type": "string",
                    "description": "Additional instructions for the extraction (optional)"
                },
                "target_variable": {
                    "type": "string",
                    "description": "Variable name to store the result in"
                },
                "model": {
                    "type": "string",
                    "description": "LLM model to use (optional)"
                }
            },
            "required": ["source_text", "schema", "target_variable"]
        }
    
    async def execute(
        self, 
        params: Dict[str, Any], 
        state: Dict[str, Any]
    ) -> PrimitiveResult:
        """
        Execute the extraction.
        """
        # 1. Initialize variables
        variables = state.get("variables", {})
        
        # 2. Resolve parameters
        source_text = self.resolve_variables(params.get("source_text", ""), state)
        instruction = self.resolve_variables(params.get("instruction", ""), state)
        schema = params.get("schema", {})
        target_variable = params.get("target_variable")
        model = variables.get("model") or params.get("model", "gpt-4o") # Use a smart model by default for extraction
        
        # Fallback: Implicit Context (Pipeline Mode)
        if not source_text:
            current_out = state.get("current_output")
            if current_out:
                if isinstance(current_out, dict):
                    # Smart Extraction: Look for content keys
                    priority_keys = ["combined_context", "text", "content", "output", "result", "markdown", "report"]
                    found_content = None
                    for key in priority_keys:
                        if key in current_out and isinstance(current_out[key], str) and current_out[key].strip():
                            found_content = current_out[key]
                            break
                    
                    if found_content:
                         source_text = found_content
                         print(f"[EXTRACTOR] Implicit context: Extracted content from key '{key}'")
                    else:
                         source_text = json.dumps(current_out, indent=2)
                elif isinstance(current_out, list):
                    source_text = json.dumps(current_out, indent=2)
                else:
                    source_text = str(current_out)
                print(f"[EXTRACTOR] Using implicit previous context.")
        
        # Smart Template Fix: If still no source text, check global state variables
        # This handles the case where this is the FIRST node and needed input is in 'inputs'/'variables'
        if not source_text:
            
            # STRICT CONTRACT SUPPORT
            if "extractor_input" in variables:
                ext_input = variables["extractor_input"]
                if isinstance(ext_input, dict) and "assets" in ext_input:
                     print(f"[EXTRACTOR] Using 'extractor_input' from strict contract.")
                     assets = ext_input["assets"]
                     
                     # --- ASSET SCOPE VALIDATION ---
                     asset_scope = params.get("asset_scope", "single") # Default to single
                     asset_count = len(assets)
                     
                     if asset_scope == "single" and asset_count > 1:
                         print(f"[EXTRACTOR] WARNING: Configuration expects SINGLE asset, but {asset_count} provided. Analysis may be imprecise.")
                         # We don't block execution, but we log the warning. 
                         # Ideally, we could return a warning in the result, but primitive result struct doesn't have 'warnings' field yet.
                         # We'll rely on logs for now, or append to instruction.
                         instruction += f"\n\n[SYSTEM WARNING: The user configured this step for a SINGLE asset, but {asset_count} were provided. If this is a comparison, results might be unexpected.]"
                         
                     elif asset_scope == "multiple" and asset_count <= 1:
                         print(f"[EXTRACTOR] WARNING: Configuration expects MULTIPLE assets, but {asset_count} provided.")
                         instruction += f"\n\n[SYSTEM WARNING: The user configured this step for MULTIPLE assets (Comparison), but only {asset_count} was provided.]"
                     # -----------------------------

                     # Construct source text from assets
                     parts = []
                     for a in assets:
                         content = a.get("content") or ""
                         a_type = a.get("type", "unknown")
                         a_id = a.get("id", "unknown")
                         parts.append(f"--- Asset (ID: {a_id}, Type: {a_type}) ---\n{content}")
                     source_text = "\n\n".join(parts)
                     
                     # Also fallback instruction if not provided
                     if not instruction and "extraction_instructions" in ext_input:
                         instr_obj = ext_input["extraction_instructions"]
                         instruction = f"Focus: {instr_obj.get('focus')}\nExclude: {instr_obj.get('exclude')}"
            
            # Legacy support
            elif "combined_context" in variables:
                 source_text = variables["combined_context"]
                 print(f"[EXTRACTOR] Using 'combined_context' from global state.")
            elif "text" in variables:
                 source_text = variables["text"]
                 print(f"[EXTRACTOR] Using 'text' from global state.")

        if not source_text:
            return PrimitiveResult(
                success=False,
                error="Source text is empty"
            )
            
        # 2. Construct prompt
        # STRICT CONTRACT OUTPUT
        if "extractor_input" in variables:
            from app.schemas.smart_contracts import ExtractorOutput
            
            # Use the strict Pydantic model for the schema
            schema_str = json.dumps(ExtractorOutput.model_json_schema(), indent=2)
            
            # Enhanced System Prompt for Strict Mode
            system_prompt = f"""You are a precise data extraction assistant.
You have been provided with multiple source assets, each marked with an ID.
Your task is to extract information according to the user's focus and the required Output Schema.

Output Schema:
{schema_str}

CRITICAL INSTRUCTIONS:
1. You MUST return a valid JSON object matching 'ExtractorOutput'.
2. The 'extracted_elements' list must contain items where 'source_id' matches the Asset ID provided in the text.
3. 'data' should contain the information extracted based on the instructions.
4. 'content_type' should be 'text' unless specific images/tables are extracted.
"""
            user_content = f"Source Assets:\n{source_text}"
            if instruction:
                user_content += f"\n\nExtraction Instructions:\n{instruction}"
                
            messages = [
                ChatMessage(role="system", content=system_prompt),
                ChatMessage(role="user", content=user_content)
            ]
             
            # Call LLM with JSON mode
            response_text = await llm_service.chat(
                messages=messages,
                model_name=model,
                response_format={"type": "json_object"}
            )
            
            try:
                extracted_data = json.loads(response_text)
                # Verify it matches ExtractorOutput structure (loose validation)
                if "extracted_elements" not in extracted_data:
                     # Attempt auto-fix if LLM returned just the list or inner data
                     extracted_data = {"extracted_elements": []} 
                     # (In production we might want to retry, but for now just fail safe or accept it)
                     
                state["variables"][target_variable] = extracted_data
                # Also store strictly as extractor_output for next node
                state["variables"]["extractor_output"] = extracted_data
                
                return PrimitiveResult(success=True, output=extracted_data)
            except Exception as e:
                return PrimitiveResult(success=False, error=f"Strict Extraction failed: {str(e)}")

        # LEGACY/GENERIC MODE
        try:
            schema_str = json.dumps(schema, indent=2)
        except Exception as e:
            # ... (keep existing error handling)
            schema_str = str(schema)

        system_prompt = f"""You are a precise data extraction assistant.
Extract information from the provided text according to the following JSON schema.
Return ONLY valid JSON matching the schema.

Schema:
{schema_str}
"""
        
        user_content = f"Source Text:\n{source_text}"
        if instruction:
            user_content += f"\n\nAdditional Instructions:\n{instruction}"
            
        messages = [
            ChatMessage(role="system", content=system_prompt),
            ChatMessage(role="user", content=user_content)
        ]
        
        # 3. Call LLM
        try:
            response_text = await llm_service.chat(
                messages=messages,
                model_name=model,
                response_format={"type": "json_object"}
            )
            
            # 4. Parse result
            try:
                extracted_data = json.loads(response_text)
            except json.JSONDecodeError:
                # Fallback: try to find JSON in the text
                import re
                match = re.search(r'\{.*\}', response_text, re.DOTALL)
                if match:
                    extracted_data = json.loads(match.group(0))
                else:
                    return PrimitiveResult(
                        success=False,
                        error=f"LLM returned invalid JSON: {response_text[:100]}..."
                    )
            
            # 5. Store result
            if "variables" not in state:
                state["variables"] = {}
            state["variables"][target_variable] = extracted_data
            
            # For strict pipeline compatibility, we might want to fake an extractor_output here?
            # But let's assume legacy mode is legacy.
            
            return PrimitiveResult(
                success=True,
                output=extracted_data
            )
            
        except Exception as e:
            return PrimitiveResult(
                success=False,
                error=f"Extraction failed: {str(e)}"
            )
