"""
ForEach End Primitive

Ends a loop iteration and jumps back to the start.
"""
from typing import Any, Dict
from app.services.agent_primitives.base import BasePrimitive, PrimitiveResult

class ForEachEndPrimitive(BasePrimitive):
    """
    Primitive that marks the end of a loop iteration.
    
    It collects a result (optional) and appends it to the results list.
    Then it directs execution back to the loop start.
    """
    
    @property
    def name(self) -> str:
        return "FOREACH_END"
    
    @property
    def description(self) -> str:
        return "Ends a loop iteration, collects results, and returns to start."
    
    @property
    def param_schema(self) -> Dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "start_node_id": {
                    "type": "string",
                    "description": "ID of the corresponding FOREACH_START node"
                },
                "collect_value": {
                    "type": "string",
                    "description": "Value to append to results (e.g. {{last_step.output}})"
                },
                "results_var": {
                     "type": "string",
                     "description": "Variable to store collected results (must match Start node)",
                     "default": "results"
                }
            },
            "required": ["start_node_id"]
        }
    
    async def execute(
        self, 
        params: Dict[str, Any], 
        state: Dict[str, Any]
    ) -> PrimitiveResult:
        try:
            start_node_id = params.get("start_node_id")
            collect_value_tpl = params.get("collect_value")
            results_var = params.get("results_var", "results")
            
            # 1. Collect Result
            if collect_value_tpl:
                value = self.resolve_variables(collect_value_tpl, state)
                
                # Append to list
                variables = state.get("variables", {})
                current_results = variables.get(results_var, [])
                if not isinstance(current_results, list):
                    current_results = []
                
                # Prevent Circular Reference
                # If the value being collected IS the results list itself, or contains it.
                # A simple identity check covers the most common user error: collect_value="{{results}}"
                if value is current_results:
                     # Fallback: snapshot the list at this moment
                     value = list(current_results) 
                
                current_results.append(value)
                
                # Update state
                # Note: PrimitiveResult output updates variables.
                output_update = {
                    results_var: current_results
                }
            else:
                output_update = {}

            # 2. Loop Back
            # We explicitly tell runtime to go to start_node_id
            
            return PrimitiveResult(
                success=True,
                output=output_update,
                next_node=start_node_id
            )

        except Exception as e:
            return PrimitiveResult(success=False, error=str(e))
