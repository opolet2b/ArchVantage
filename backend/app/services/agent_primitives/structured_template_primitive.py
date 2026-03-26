from typing import Any, Dict, List, Optional
from app.services.agent_primitives.base import BasePrimitive, PrimitiveResult
from app.services.llm_service import LLMService

class StructuredTemplatePrimitive(BasePrimitive):
    """
    Executes a structured JSON template directly, handling sections, instructions, loops, and conditionals.
    This replaces the regex-based parsing of Markdown templates.
    """

    def __init__(self, llm_service: LLMService = None):
        self.llm_service = llm_service or LLMService()

    @property
    def name(self) -> str:
        return "STRUCTURED_TEMPLATE"

    @property
    def description(self) -> str:
        return "Executes a structured JSON template with support for loops, conditionals, and sections."

    @property
    def param_schema(self) -> Dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "template_structure": {
                    "type": "array",
                    "description": "The JSON structure of the template."
                },
                "variables": {
                    "type": "object",
                    "description": "Variables for loops and conditions."
                }
            },
            "required": ["template_structure"]
        }

    async def execute(self, params: Dict[str, Any], state: Dict[str, Any]) -> PrimitiveResult:
        """
        Execute the structured template.
        Expected params (inputs):
        - template_structure: The JSON structure of the template (List[Dict]).
        - variables: Dict of variables for loops/conditions (e.g., source documents).
        """
        structure = params.get("template_structure")
        variables = params.get("variables", {})
        
        # Fallback to state variables if not provided directly
        if not variables:
            variables = {k: v for k, v in state.items() if k not in ["template_structure"]}

        if not structure or not isinstance(structure, list):
            return PrimitiveResult(
                success=False,
                error="Missing or invalid 'template_structure' input. Must be a list of blocks."
            )

        try:
            generated_content = await self._process_blocks(structure, variables)
            
            return PrimitiveResult(
                success=True,
                output={
                    "content": generated_content,
                    "markdown": generated_content, # Alias
                    "_raw": generated_content,
                    "reasoning": "\n\n".join(self._aggregated_reasoning) if hasattr(self, "_aggregated_reasoning") and self._aggregated_reasoning else None
                }
            )
        except Exception as e:
            import traceback
            traceback.print_exc()
            return PrimitiveResult(
                success=False,
                error=f"Error executing structured template: {str(e)}"
            )

    async def _process_blocks(self, blocks: List[Dict[str, Any]], variables: Dict[str, Any]) -> str:
        """
        Recursively process a list of blocks and return the concatenated markdown string.
        """
        output = []

        for block in blocks:
            block_type = block.get("type")
            
            if block_type == "section":
                title = self._render_string(block.get("title", "Untitled Section"), variables)
                children = block.get("children", [])
                child_content = await self._process_blocks(children, variables)
                
                # Simple Markdown Header logic based on depth? 
                # For now, we assume H2 for top level or let the hierarchy be flat.
                # Ideally, we should track depth. Let's assume standard H2 for Sections.
                # If we want nested, we might need a depth param.
                
                output.append(f"\n## {title}\n\n{child_content}")

            elif block_type == "text":
                content = block.get("content", "")
                rendered = self._render_string(content, variables)
                output.append(rendered)

            elif block_type == "instruction":
                instruction = block.get("content", "")
                assign_to = block.get("assignTo") or block.get("assign_to")
                
                if assign_to:
                    print(f"[StructuredTemplatePrimitive] Executing ASSIGN for variable '{assign_to}'")
                    # Initialize reasoning if not present in recursive scope
                    if not hasattr(self, '_aggregated_reasoning'):
                        self._aggregated_reasoning = []

                    system_prompt = (
                        "You are a precise data extraction assistant.\n"
                        "Extract information from the provided context according to the instruction.\n"
                        "Return ONLY valid JSON. If you are extracting a list of items, wrap it in a root object with the key 'items', e.g., {\"items\": [...]}.\n"
                        "Do NOT include any markdown formatting, conversational text, or explanations outside the JSON."
                    )
                    
                    import json
                    context_str = json.dumps(variables, default=str)[:15000]
                    user_prompt = f"INSTRUCTION: {instruction}\n\nCONTENT TO EXTRACT FROM:\n{context_str}"
                    
                    try:
                        from app.models.chat import Message
                        messages = [
                            Message(role="system", content=system_prompt),
                            Message(role="user", content=user_prompt)
                        ]
                        # Use the service's chat with response_format and preserve thinking
                        import re
                        result_str_raw = await self.llm_service.chat(messages, response_format={"type": "json_object"}, strip_think=False)
                        
                        # Extract thinking
                        think_match = re.search(r"<think>(.*?)</think>", result_str_raw, flags=re.DOTALL | re.IGNORECASE)
                        if think_match:
                            trace = think_match.group(1).strip()
                            self._aggregated_reasoning.append(f"### Assignment: {assign_to}\n{trace}")
                            result_str = re.sub(r"<think>.*?</think>", "", result_str_raw, flags=re.DOTALL | re.IGNORECASE).strip()
                        else:
                            result_str = result_str_raw

                        clean_response = result_str.strip()
                        if clean_response.startswith("```json"):
                            clean_response = clean_response[7:]
                        elif clean_response.startswith("```"):
                            clean_response = "\n".join(clean_response.split("\n")[1:])
                        if clean_response.endswith("```"):
                            clean_response = clean_response[:-3].strip()
                            
                        parsed_data = json.loads(clean_response)
                        
                        if isinstance(parsed_data, dict) and assign_to in parsed_data:
                            variables[assign_to] = parsed_data[assign_to]
                        elif isinstance(parsed_data, dict) and "items" in parsed_data:
                            variables[assign_to] = parsed_data["items"]
                        else:
                            variables[assign_to] = parsed_data
                            
                    except Exception as e:
                        print(f"[StructuredTemplatePrimitive] JSON Parsing error for assignment {assign_to}: {e}")
                        variables[assign_to] = result_str if 'result_str' in locals() else ""
                    
                    # Do not append instruction text to output
                    continue
                else:
                    output.append(f"<!-- INSTRUCTION: {instruction} -->")

            elif block_type == "loop":
                loop_source = block.get("loopSource")
                loop_var = variables.get(loop_source)
                
                if isinstance(loop_var, list):
                    children = block.get("children", [])
                    for i, item in enumerate(loop_var):
                        # Create generic "item" variable or specific?
                        # Let's support "item" as keyword
                        local_vars = variables.copy()
                        local_vars["item"] = item
                        local_vars["index"] = i + 1
                        
                        # Process children with local scope
                        child_output = await self._process_blocks(children, local_vars)
                        output.append(child_output)

            elif block_type == "if":
                condition = block.get("content", "") # e.g. "item.status == 'active'"
                # Simple evaluation?
                # Security risk with eval(). Use restricted evaluation or simple boolean check.
                should_run = self._evaluate_condition(condition, variables)
                
                if should_run:
                    children = block.get("children", [])
                    output.append(await self._process_blocks(children, variables))
                # Handle ELSE? 
                # In our JSON, ELSE might be a sibling or nested? 
                # Our parsing logic made ELSE a sibling. We need to handle it.
                # We can't peek ahead easily here in a flat loop unless we track state.
                
                # Actually, if we use the parser's logic, ELSE is a block type.
                # We need to knowing if the PREVIOUS 'if' failed.
                # This suggests we need stateful iteration.
                
            elif block_type == "else":
                # Only run if previous IF was false?
                # Needs state. 
                pass 

        return "\n".join(output)

    def _render_string(self, text: str, variables: Dict[str, Any]) -> str:
        # Simple Jinja2-like substitution
        try:
            from jinja2 import Template
            t = Template(text)
            return t.render(**variables)
        except Exception:
            return text

    def _evaluate_condition(self, condition: str, variables: Dict[str, Any]) -> bool:
        # Very basic safe eval
        try:
            # TODO: Implement safer evaluation engine
            # For now, simplistic check
            return False
        except:
            return False
