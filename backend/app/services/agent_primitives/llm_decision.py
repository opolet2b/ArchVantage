"""
LLM Decision Primitive

Uses an LLM for routing decisions and reasoning within the agent workflow.
"""
from typing import Any, Dict
from app.services.agent_primitives.base import BasePrimitive, PrimitiveResult


class LLMDecisionPrimitive(BasePrimitive):
    """
    Primitive for LLM-based decision making.
    
    Uses the selectable LLM service for reasoning and routing.
    """
    
    @property
    def name(self) -> str:
        return "LLM_DECISION"
    
    @property
    def description(self) -> str:
        return "Uses an LLM for routing decisions or generating content."
    
    @property
    def param_schema(self) -> Dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "model": {
                    "type": "string",
                    "description": "LLM model to use",
                    "default": "default"
                },
                "instruction": {
                    "type": "string",
                    "description": "System instruction for the LLM"
                },
                "input_context": {
                    "type": "string",
                    "description": "Variable or expression for input context (used for variable resolution)"
                },
                "send_context_to_llm": {
                    "type": "boolean",
                    "description": "If true, send input_context as user message to LLM. If false, only use it for variable resolution.",
                    "default": True
                },
                "output_variable": {
                    "type": "string",
                    "description": "Variable name to store the LLM response",
                    "default": "llm_output"
                },
                "routing": {
                    "type": "object",
                    "description": "Optional routing based on LLM response",
                    "properties": {
                        "enabled": {"type": "boolean"},
                        "options": {
                            "type": "object",
                            "additionalProperties": {"type": "string"}
                        }
                    }
                }
            },
            "required": ["instruction"]
        }
    
    async def execute(
        self, 
        params: Dict[str, Any], 
        state: Dict[str, Any]
    ) -> PrimitiveResult:
        """Execute LLM decision/generation."""
        try:
            from app.services.llm_service import llm_service
            from app.models.chat import Message
            
            # Use centralized config resolution
            model = self.get_llm_config(state, params)
            print(f"[LLM_DECISION] Resolved Model: {model}")
            
            instruction = params.get("instruction", "")
            input_context_var = params.get("input_context", "")
            send_context_to_llm = params.get("send_context_to_llm", True)
            output_var = params.get("output_variable", "llm_output")
            routing = params.get("routing", {})
            
            # Resolve input context from variables
            variables = state.get("variables", {})

            # Get input context (could be a variable name or template)
            input_context = ""

            def resolve_deep(val: Any) -> Any:
                """Recursively resolve variables in strings, lists, or dicts."""
                if isinstance(val, str):
                    if "{{" in val:
                        return self.resolve_variables(val, state)
                    return val
                elif isinstance(val, list):
                    return [resolve_deep(item) for item in val]
                elif isinstance(val, dict):
                    return {k: resolve_deep(v) for k, v in val.items()}
                return val

            if input_context_var:
                if input_context_var.startswith("{{"):
                    # Single variable reference
                    input_context = self.resolve_variables(input_context_var, state)
                elif input_context_var.strip().startswith("{") or input_context_var.strip().startswith("["):
                    # Likely a JSON string containing variables
                    try:
                        import json
                        parsed = json.loads(input_context_var)
                        input_context = resolve_deep(parsed)
                    except json.JSONDecodeError:
                        input_context = input_context_var
                else:
                    # Variable name or literal string
                    try:
                        input_context = self._get_nested_value(variables, input_context_var)
                        input_context = resolve_deep(input_context)
                    except (KeyError, TypeError):
                        input_context = input_context_var

            # Serialize complex context to string for the LLM
            if isinstance(input_context, (dict, list)):
                import json
                input_context = json.dumps(input_context, indent=2)
            
            # Resolve any variables in the instruction template
            # This allows using {{variable}} placeholders in the instruction
            resolved_instruction = self.resolve_variables(instruction, state)
            
            # Build messages for LLM
            # If send_context_to_llm is False, only send the instruction (no user context message)
            if send_context_to_llm and input_context:
                messages = [
                    Message(role="system", content=resolved_instruction),
                    Message(role="user", content=str(input_context))
                ]
            else:
                # Only send instruction as the user message (no separate context)
                messages = [
                    Message(role="user", content=resolved_instruction)
                ]
            
            # Call LLM
            # Use the service's chat with strip_think=False to capture reasoning
            import re
            response_raw = await llm_service.chat(messages, model_name=model, strip_think=False)
            
            # Extract thinking
            think_match = re.search(r"<think>(.*?)</think>", response_raw, flags=re.DOTALL | re.IGNORECASE)
            reasoning = None
            if think_match:
                reasoning = think_match.group(1).strip()
                response = re.sub(r"<think>.*?</think>", "", response_raw, flags=re.DOTALL | re.IGNORECASE).strip()
            else:
                response = response_raw
            
            # Handle routing if enabled
            next_node = None
            if routing.get("enabled") and routing.get("options"):
                options = routing["options"]
                response_lower = response.lower().strip()
                for key, target_node in options.items():
                    if key.lower() in response_lower:
                        next_node = target_node
                        break
            
            return PrimitiveResult(
                success=True,
                output={
                    output_var: response,
                    "reasoning": reasoning,
                    "_raw": response
                },
                next_node=next_node
            )
            
        except Exception as e:
            return PrimitiveResult(
                success=False,
                error=f"LLM decision failed: {str(e)}"
            )
