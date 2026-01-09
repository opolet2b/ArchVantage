"""
Extractor Primitive

Uses an LLM to extract structured data from text based on a provided schema.
"""
from typing import Any, Dict, List, Optional
import logging
import json
import re

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
        instruction = self.resolve_variables(params.get("instruction", ""), state)
        target_variable = params.get("target_variable")
        schema = params.get("schema", {})
        model = variables.get("model") or params.get("model", "gpt-4o")

        # 3. Resolve Source Text
        source_text = params.get("source_text")
        
        # Debug Log
        try:
            with open("execution_debug.log", "a", encoding="utf-8") as f:
                f.write(f"\n[EXTRACTOR DEBUG] Initial source_text from params: '{str(source_text)[:50]}...'\n")
        except: pass

        if not source_text:
            # Try getting from previous step output in state
            source_text = state.get("current_output")
            try:
                with open("execution_debug.log", "a", encoding="utf-8") as f:
                     f.write(f"[EXTRACTOR DEBUG] source_text from current_output: '{str(source_text)[:50]}...'\n")
            except: pass

        if not source_text:
             # Try specific variable keys (convention)
             variables = state.get("variables", {})
             # Check 'extractor_input' which might be a dict with assets/content
             extractor_input = variables.get("extractor_input")
             
             try:
                with open("execution_debug.log", "a", encoding="utf-8") as f:
                     f.write(f"[EXTRACTOR DEBUG] extractor_input variable: {str(extractor_input)[:200]}\n")
             except: pass

             if isinstance(extractor_input, dict):
                 # Handle assets list
                 if "assets" in extractor_input and isinstance(extractor_input["assets"], list):
                     texts = []
                     for asset in extractor_input["assets"]:
                         if "content" in asset and asset["content"]:
                             texts.append(asset["content"])
                     if texts:
                         source_text = "\n\n".join(texts)
                 
                 # Handle direct content
                 elif "content" in extractor_input:
                     source_text = extractor_input["content"]
                     
             # Fallback to combined_context or text
             if not source_text:
                 source_text = variables.get("combined_context") or variables.get("text")
        
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
                         if instr_obj.get("additional_instructions"):
                             instruction += f"\n\nAdditional Instructions:\n{instr_obj.get('additional_instructions')}"
            
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
The Source Assets may be in any language. You MUST analyze them in their original language and extract the requested information. 
If the Output Schema keys are in English, you must TRANSLATE the extracted information concepts to match the schema's structure and intent. 
Do NOT return empty results just because the language differs.

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
                
            # FORCE INSTRUCTION REINFORCEMENT
            user_content += "\n\nIMPORTANT: If the source text is in a different language than the schema keys (English), you MUST TRANSLATE the concepts. For example, if looking for 'Strengths', extract 'Forces' or positive aspects from the text and map them to 'Strengths'."
            user_content += "\n\nCRITICAL OUTPUT RULE: You MUST ONLY return a JSON object with the key 'extracted_elements'. Do NOT create keys like 'generated_markdown', 'report', or 'summary'. Put all your findings into the 'data' field of an extracted element."
                
            messages = [
                ChatMessage(role="system", content=system_prompt),
                ChatMessage(role="user", content=user_content)
            ]
            
            # Debug Log: Dump the full messages (STRICT MODE)
            try:
                with open("execution_debug.log", "a", encoding="utf-8") as f:
                    f.write(f"\n[EXTRACTOR PROMPT DEBUG-STRICT]\nSYSTEM: {messages[0].content}\nUSER: {messages[1].content[:500]}...\n")
            except: pass
             
            # Call LLM with JSON mode
            response_text = await llm_service.chat(
                messages=messages,
                model_name=model,
                response_format={"type": "json_object"}
            )
            
            # Debug Log: Final Response
            try:
                with open("execution_debug.log", "a", encoding="utf-8") as f:
                    f.write(f"\n[EXTRACTOR RESPONSE DEBUG]\n{response_text[:3000]}\n")
            except: pass
            
            try:
                try:
                    extracted_data = json.loads(response_text)
                except json.JSONDecodeError:
                    # Fallback on JSON error: Try to repair truncated JSON
                    # 1. Regex to find the start of the JSON object (ignoring trailing garbage if possible, but identifying start is key)
                    import re
                    match = re.search(r'\{[\s\S]*', response_text)
                    
                    if match:
                        json_candidate = match.group(0).strip()
                        
                        # 2. Simple Repair Logic
                        def repair_json(broken_json):
                            stack = []
                            is_inside_string = False
                            escaped = False
                            
                            clean_json = ""
                            
                            # Consume string char by char to track state
                            for char in broken_json:
                                clean_json += char
                                
                                if is_inside_string:
                                    if char == '"' and not escaped:
                                        is_inside_string = False
                                    elif char == '\\':
                                        escaped = not escaped
                                    else:
                                        escaped = False
                                else:
                                    if char == '"':
                                        is_inside_string = True
                                    elif char == '{':
                                        stack.append('}')
                                    elif char == '[':
                                        stack.append(']')
                                    elif char == '}' or char == ']':
                                        if stack:
                                            if stack[-1] == char:
                                                stack.pop()
                                                
                            # Close unclosed string
                            if is_inside_string:
                                clean_json += '"'
                                
                            # Close unclosed brackets/braces
                            while stack:
                                clean_json += stack.pop()
                                
                            return clean_json

                        repaired_json = repair_json(json_candidate)
                        try:
                            print(f"[EXTRACTOR] Attempting to parse repaired JSON: {repaired_json[:100]}...")
                            extracted_data = json.loads(repaired_json)
                            print("[EXTRACTOR] Repair successful.")
                        except:
                             # Last Ditch: ast.literal_eval if it looks like python dict
                             try:
                                 import ast
                                 extracted_data = ast.literal_eval(repaired_json)
                             except:
                                 raise ValueError("Could not parse JSON even after repair attempt.")
                    else:
                         raise ValueError("No JSON object start '{' found.")

                # Verify it matches ExtractorOutput structure (loose validation)
                if "extracted_elements" not in extracted_data:
                     # CRITICAL FIX: If LLM returns flat JSON (ignoring schema), wrap it instead of discarding
                     # Find first asset ID to attribute to
                     first_asset_id = extractor_input["assets"][0]["id"] if extractor_input.get("assets") else "unknown"
                     extracted_data = {
                         "extracted_elements": [
                             {
                                 "source_id": first_asset_id,
                                 "content_type": "json",
                                 "data": extracted_data,
                                 "metadata": {"generated_by": "fallback_wrapper"}
                             }
                         ]
                     } 
                     
                state["variables"][target_variable] = extracted_data
                state["variables"]["extractor_output"] = extracted_data
                
                return PrimitiveResult(success=True, output=extracted_data)
            except Exception as e:
                # Log the bad response for debugging
                error_msg = f"Strict Extraction failed: {str(e)}. Response start: {response_text[:200]}"
                print(f"[EXTRACTOR] ERROR: {error_msg}")
                return PrimitiveResult(success=False, error=error_msg)

        # LEGACY/GENERIC MODE
        
        # Branch: Text Extraction vs JSON Extraction
        if not schema:
            # TEXT-ONLY MODE (User's "Agnostic" Extractor)
            print(f"[EXTRACTOR] No ID/Schema provided. Running in TEXT extraction mode.")
            system_prompt = f"""You are a precise data extraction and filtering assistant.
The Source Assets may be in any language. You MUST analyze them in their original language.
            
Your task is to EXTRACT precise, relevant content from the provided text based on the instructions.
- Remove irrelevant "garbage" (headers, footers, ads, unrelated sections).
- Keep only content that matches the user's instructions or focus.
- Do NOT summarize unless asked. Quote or extract the text segments directly.
- Preserve the original meaning and context.
"""
            user_content = f"Source Text:\n{source_text}"
            if instruction:
                user_content += f"\n\nExtraction Instructions:\n{instruction}"
            
            messages = [
                ChatMessage(role="system", content=system_prompt),
                ChatMessage(role="user", content=user_content)
            ]
            
            try:
                # Call LLM (Standard Text Mode)
                response_text = await llm_service.chat(
                    messages=messages,
                    model_name=model
                    # No response_format="json_object"
                )
                
                # Store result
                if "variables" not in state:
                    state["variables"] = {}
                
                # If target_variable is set, store it there. 
                # Also store as 'extractor_output' (as a dict for consistency? Or just text?)
                # To support Agent downstream, strict pipeline expects key 'data' or similar if it looks for it.
                # But generic agent just grabs 'current_output'.
                
                final_output = response_text
                
                if target_variable:
                     state["variables"][target_variable] = final_output
                
                # Also set as current output implicitly via result
                return PrimitiveResult(
                    success=True,
                    output=final_output
                )
                
            except Exception as e:
                return PrimitiveResult(
                    success=False,
                    error=f"Text Extraction failed: {str(e)}"
                )

        # JSON / SCHEMA MODE (Existing Logic)
        try:
            schema_str = json.dumps(schema, indent=2)
        except Exception as e:
            schema_str = str(schema)

        system_prompt = f"""You are a precise data extraction assistant.
The Source Assets may be in any language. You MUST analyze them in their original language and extract the requested information. 
If the Output Schema keys are in English, you must TRANSLATE the extracted information concepts to match the schema's structure and intent.
Do NOT return empty results just because the language differs.

Extract information from the provided text according to the following JSON schema.
Return ONLY valid JSON matching the schema.

Schema:
{schema_str}
"""
        
        user_content = f"Source Text:\n{source_text}"
        if instruction:
            user_content += f"\n\nAdditional Instructions:\n{instruction}"
            
        # FORCE INSTRUCTION REINFORCEMENT
        user_content += "\n\nIMPORTANT: If the source text is in a different language than the schema keys (English), you MUST TRANSLATE the concepts. For example, if looking for 'Strengths', extract 'Forces' or positive aspects from the text and map them to 'Strengths'."
            
        messages = [
            ChatMessage(role="system", content=system_prompt),
            ChatMessage(role="user", content=user_content)
        ]
        
        # Debug Log: Dump the full messages
        try:
            with open("execution_debug.log", "a", encoding="utf-8") as f:
                f.write(f"\n[EXTRACTOR PROMPT DEBUG]\nSYSTEM: {messages[0].content}\nUSER: {messages[1].content[:500]}...\n")
        except: pass
        
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
            if target_variable:
                state["variables"][target_variable] = extracted_data
            
            return PrimitiveResult(
                success=True,
                output=extracted_data
            )
            
        except Exception as e:
            return PrimitiveResult(
                success=False,
                error=f"Extraction failed: {str(e)}"
            )
