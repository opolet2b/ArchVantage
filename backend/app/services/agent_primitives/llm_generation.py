"""
LLM Generation Primitive

Uses an LLM for general content generation within the agent workflow.
"""
from typing import Any, Dict
import json
from app.services.agent_primitives.base import BasePrimitive, PrimitiveResult


class LLMGenerationPrimitive(BasePrimitive):
    """
    Primitive for LLM-based content generation.
    
    Uses the selectable LLM service for generating text response.
    """
    
    @property
    def name(self) -> str:
        return "LLM_GENERATION"
    
    @property
    def description(self) -> str:
        return "Uses an LLM to generate content based on instructions and context."
    
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
                }
            },
            "required": ["instruction"]
        }
    
    async def execute(
        self, 
        params: Dict[str, Any], 
        state: Dict[str, Any]
    ) -> PrimitiveResult:
        """Execute LLM generation."""
        try:
            from app.services.llm_service import llm_service
            from app.models.chat import Message
            
            # Resolve variables first
            variables = state.get("variables", {})
            
            # Prioritize global model override from inputs (e.g. Canvas selection)
            global_model = variables.get("model")
            param_model = params.get("model", "default")
            model = global_model or param_model
            
            print(f"[LLM_PRIM] Resolved Model: {model} (Global: {global_model}, Param: {param_model})")
            instruction = params.get("instruction", "")
            input_context_var = params.get("input_context", "")
            send_context_to_llm = params.get("send_context_to_llm", True)
            output_var = params.get("output_variable", "llm_output")
            
            # Resolve input context from variables
            variables = state.get("variables", {})
            
            # Get input context (could be a variable name or template)
            input_context = ""
            if input_context_var:
                if input_context_var.startswith("{{"):
                    input_context = self.resolve_variables(input_context_var, state)
                else:
                    try:
                        input_context = self._get_nested_value(variables, input_context_var)
                        if isinstance(input_context, (dict, list)):
                            import json
                            input_context = json.dumps(input_context, indent=2)
                    except (KeyError, TypeError):
                        input_context = input_context_var
            
            # Fallback: Implicit Context (Pipeline Mode)
            # If no input_context is configured, usage the output of the previous node.
            if not input_context and not input_context_var:
                current_out = state.get("current_output")
                if current_out:
                    # Auto-use previous node's output
                    # Smart Primitive Fix: Check for content keys in dict
                    if isinstance(current_out, dict):
                         # Prioritize combined_context (from Smart Template)
                         if "combined_context" in current_out:
                             input_context = current_out["combined_context"]
                         # Prioritize text/content fields
                         elif "text" in current_out:
                             input_context = current_out["text"]
                         # Fallback to JSON dump if no content found
                         else:
                             import json
                             input_context = json.dumps(current_out, indent=2)
                    elif isinstance(current_out, list):
                        import json
                        input_context = json.dumps(current_out, indent=2)
                    else:
                        input_context = str(current_out)
                    print(f"[LLM_PRIM] Using implicit previous context.")
            
            # Smart Template Fix: If still no input context, check global state variables
            # This handles the case where this is the FIRST node and needed input is in 'inputs'/'variables'
            if not input_context:
                variables = state.get("variables", {})
                if "combined_context" in variables:
                     input_context = variables["combined_context"]
                     print(f"[LLM_PRIM] Using 'combined_context' from global state.")
                elif "text" in variables:
                     input_context = variables["text"]
                     print(f"[LLM_PRIM] Using 'text' from global state.")

            print(f"[LLM_PRIM] Input Context Length: {len(input_context) if input_context else 0}")
            if input_context:
                 print(f"[LLM_PRIM] Input Context Snippet: {input_context[:2000]}...")
            else:
                 print(f"[LLM_PRIM] WARNING: Input Context is EMPTY!")

            # Resolve any variables in the instruction template
            resolved_instruction = self.resolve_variables(instruction, state)
            
            # Build messages for LLM
            if send_context_to_llm and input_context:
                messages = [
                    Message(role="system", content=resolved_instruction),
                    Message(role="user", content=str(input_context))
                ]
            else:
                messages = [
                    Message(role="user", content=resolved_instruction)
                ]
            
            # STRICT CONTRACT MODE
            # If we have 'extractor_output' from previous node, we enforce AgentOutput schema
            extractor_out = variables.get("extractor_output")
            # Also check if we are in a strict pipeline context (optional, but good safety)
            
            if extractor_out:
                try:
                    from app.schemas.smart_contracts import AgentOutput, AgentConfiguration, ExtractorOutput
                    
                    print(f"[LLM_PRIM] Strict Mode detected. Using AgentOutput schema.")
                    
                    # 1. Prepare Agent Configuration
                    # Filter variables to ensure strict string keys (Pydantic requirement)
                    safe_variables = {str(k): v for k, v in variables.items() if k is not None}
                    
                    agent_config = AgentConfiguration(
                        persona=params.get("persona", "Helpful Assistant"),
                        reasoning_depth=params.get("reasoning_depth", "comprehensive"),
                        framework=params.get("framework"),
                        instructions=instruction,
                        user_variables=safe_variables # Pass sanitized vars
                    )
                    
                    # 2. Prepare Context (Extractor Output)
                    # We have the raw dict, we can validate it or just pass it
                    data_context = extractor_out 
                    
                    # 3. Construct System Prompt with Output Schema
                    schema_str = json.dumps(AgentOutput.model_json_schema(), indent=2)
                    
                    system_prompt = f"""You are an advanced analysis agent.
Role: {agent_config.persona}
Framework: {agent_config.framework or 'General Analysis'}

OBJECTIVE:
You have been provided with a "Data Context" and a set of "Analysis Instructions" below.
Your goal is to perform the analysis as requested, but you MUST output the results ONLY as a structured JSON object.

ANALYSIS INSTRUCTIONS:
{agent_config.instructions}

OUTPUT REQUIREMENT:
Do not write a standard text report. Capture your analysis findings, summary, and sections into the following JSON schema.

Example of valid output:
{{
  "analysis_results": {{
    "summary": "The analysis indicates...",
    "sections": [
      {{
        "title": "Key Findings",
        "findings": ["Finding 1", "Finding 2"],
        "supporting_evidence": ["source-id-1"]
      }}
    ],
    "raw_data_points": {{}}
  }}
}}

Schema:
{schema_str}
"""
                    user_message_content = f"Data Context:\n{json.dumps(data_context, indent=2)}"
                    
                    messages = [
                        Message(role="system", content=system_prompt),
                        Message(role="user", content=user_message_content)
                    ]
                    
                    for attempt in range(2):
                        # 4. Call LLM with JSON mode
                        print(f"[LLM_PRIM] Strict Gen Attempt {attempt+1}")
                        response_text = await llm_service.chat(
                            messages=messages, 
                            model_name=model,
                            response_format={"type": "json_object"}
                        )
                        
                        print(f"[LLM_PRIM] Raw LLM Response: {response_text}")
                        
                        # 5. Parse and Store
                        try:
                            agent_output_data = json.loads(response_text)
                            
                            # Validation
                            from pydantic import ValidationError
                            AgentOutput(**agent_output_data)
                            
                            # Additional empty check
                            if not agent_output_data:
                                raise ValueError("Returned empty dictionary.")
                                
                            print(f"[LLM_PRIM] Schema Validation PASSED.")
                            break # Success!
                            
                        except (json.JSONDecodeError, ValueError, Exception) as val_err:
                            print(f"[LLM_PRIM] Validation Failed (Attempt {attempt+1}): {val_err}")
                            if attempt == 0:
                                # Add error message for retry
                                err_msg = f"CRITICAL ERROR: Your previous response was invalid. Error: {val_err}\nYou MUST return a non-empty JSON object matching the 'AgentOutput' schema with 'analysis_results'."
                                messages.append(Message(role="user", content=err_msg))
                            else:
                                raise val_err # Final failure
                                
                    
                    print(f"[LLM_PRIM] Strict mode info. Keys: {list(agent_output_data.keys()) if isinstance(agent_output_data, dict) else 'Not Dict'}")
                    
                    # Save correctly
                    # Store as 'agent_output' for next node
                    if "variables" not in state: state["variables"] = {}
                    state["variables"]["agent_output"] = agent_output_data
                    state["variables"][output_var] = agent_output_data
                    
                    print(f"[LLM_PRIM] Saved 'agent_output' to variables. Type: {type(state['variables']['agent_output'])}")
                    
                    return PrimitiveResult(
                        success=True,
                        output={
                            output_var: agent_output_data,
                            "agent_output": agent_output_data,
                            "_raw": agent_output_data # Consistency
                        }
                    )
                    
                except Exception as e:
                    print(f"[LLM_PRIM] Strict mode failed after retries: {e}. Falling back to standard generation.")
                    # Fallback proceeds to standard code below
            
            # Call LLM
            # Basic generation (non-reasoning/non-json mode unless specified in future)
            response = await llm_service.chat(messages, model_name=model)
            
            return PrimitiveResult(
                success=True,
                output={
                    output_var: response,
                    "_raw": response
                }
            )
            
        except Exception as e:
            return PrimitiveResult(
                success=False,
                error=f"LLM generation failed: {str(e)}"
            )
