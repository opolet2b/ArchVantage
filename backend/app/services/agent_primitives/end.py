"""
End Primitive

Exit point primitive for agent workflows.
Signals the completion of the workflow execution.
"""
from typing import Any, Dict

from app.services.agent_primitives.base import BasePrimitive, PrimitiveResult


class EndPrimitive(BasePrimitive):
    """
    Exit point primitive for agent workflows.
    
    This primitive marks the end of the workflow and collects
    all variables as the final output. It signals that no further
    nodes should be executed.
    """
    
    @property
    def name(self) -> str:
        """Return the primitive type name."""
        return "END"
    
    @property
    def description(self) -> str:
        """Return a description of what this primitive does."""
        return "Exit point for the agent workflow. Collects final outputs."
    
    @property
    def param_schema(self) -> Dict[str, Any]:
        """
        Return JSON Schema for the primitive's parameters.
        
        END can optionally specify which variables to include in output.
        """
        return {
            "type": "object",
            "properties": {
                "output_variables": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "List of variable names to include in final output. "
                                   "If empty, all variables are included."
                }
            },
            "additionalProperties": False
        }
    
    async def execute(
        self, 
        params: Dict[str, Any], 
        state: Dict[str, Any]
    ) -> PrimitiveResult:
        """
        Execute the END primitive.
        
        Collects the final output variables and signals workflow completion.
        
        Args:
            params: Primitive-specific parameters (optional output_variables)
            state: Current execution state (variables, history, etc.)
            
        Returns:
            PrimitiveResult with success status and final outputs
        """
        variables = state.get("variables", {})
        output_vars = params.get("output_variables", [])
        
        # If specific output variables are requested, filter them
        if output_vars:
            final_output = {
                key: variables.get(key) 
                for key in output_vars 
                if key in variables
            }
        else:
            # Return all non-private variables
            final_output = {
                key: value 
                for key, value in variables.items() 
                if not key.startswith("_")
            }
        
        print(f"[END] Workflow execution completed with outputs: {list(final_output.keys())}")
        
        return PrimitiveResult(
            success=True,
            output={"_completed": True, **final_output},
            error=None
        )
