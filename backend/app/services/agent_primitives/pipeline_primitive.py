
from typing import Any, Dict, List
from app.services.agent_primitives.base import BasePrimitive, PrimitiveResult

class GenericPipelinePrimitive(BasePrimitive):
    """
    Primitive that executes a linear sequence of other primitives.
    Acts as a meta-executor for automations defined as a list of steps.
    """
    
    @property
    def name(self) -> str:
        return "EXECUTE_PIPELINE"
    
    @property
    def description(self) -> str:
        return "Executes a defined list of primitive steps sequentially."
    
    @property
    def param_schema(self) -> Dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "steps": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "primitive": {"type": "string"},
                            "inputs": {"type": "object"}
                        },
                        "required": ["primitive"]
                    },
                    "description": "List of steps to execute"
                }
            },
            "required": ["steps"]
        }
    
    async def execute(
        self, 
        params: Dict[str, Any], 
        state: Dict[str, Any]
    ) -> PrimitiveResult:
        steps = params.get("steps", [])
        results = {}
        
        print(f"[GenericPipelinePrimitive] Starting pipeline with {len(steps)} steps.")
        
        for i, step in enumerate(steps):
            primitive_name = step.get("primitive")
            step_inputs = step.get("inputs", {})
            step_id = step.get("id", f"step_{i}")
            
            print(f"[GenericPipelinePrimitive] Executing step {i}: {primitive_name}")
            
            # Resolve inputs with current state
            # We do a shallow resolve for top-level string values
            resolved_inputs = {}
            for k, v in step_inputs.items():
                if isinstance(v, str) and v.startswith("{{"):
                    resolved_inputs[k] = self.resolve_variables(v, state)
                else:
                    resolved_inputs[k] = v
                    
            # Get Primitive
            from app.services.agent_primitives import get_primitive
            primitive_cls = get_primitive(primitive_name)
            if not primitive_cls:
                return PrimitiveResult(success=False, error=f"Primitive '{primitive_name}' not found at step {i}")
            
            primitive = primitive_cls()
            
            # Execute
            try:
                result = await primitive.execute(resolved_inputs, state)
                if not result.success:
                    return PrimitiveResult(success=False, error=f"Step {i} ({primitive_name}) failed: {result.error}")
                
                # Update State/Variables with output
                if result.output:
                    # Merge into variables for future steps
                    state["variables"].update(result.output)
                    results[step_id] = result.output
                    
            except Exception as e:
                return PrimitiveResult(success=False, error=f"Exception at step {i} ({primitive_name}): {str(e)}")
                
        return PrimitiveResult(success=True, output={"pipeline_results": results})
