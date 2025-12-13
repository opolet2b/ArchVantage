"""
Start Primitive

Entry point primitive for agent workflows.
Acts as a pass-through that initializes the execution.
"""
from typing import Any, Dict

from app.services.agent_primitives.base import BasePrimitive, PrimitiveResult


class StartPrimitive(BasePrimitive):
    """
    Entry point primitive for agent workflows.
    
    This primitive marks the beginning of the workflow and passes
    through all inputs unchanged. It's required for proper workflow
    topology but doesn't perform any data transformation.
    """
    
    @property
    def name(self) -> str:
        """Return the primitive type name."""
        return "START"
    
    @property
    def description(self) -> str:
        """Return a description of what this primitive does."""
        return "Entry point for the agent workflow. Passes inputs through unchanged."
    
    @property
    def param_schema(self) -> Dict[str, Any]:
        """
        Return JSON Schema for the primitive's parameters.
        
        START has no configurable parameters.
        """
        return {
            "type": "object",
            "properties": {},
            "additionalProperties": False
        }
    
    async def execute(
        self, 
        params: Dict[str, Any], 
        state: Dict[str, Any]
    ) -> PrimitiveResult:
        """
        Execute the START primitive.
        
        Simply passes through, marking the workflow as started.
        All inputs are already available in the state.
        
        Args:
            params: Primitive-specific parameters (unused for START)
            state: Current execution state (variables, history, etc.)
            
        Returns:
            PrimitiveResult with success status and the inputs as output
        """
        # Log the start of execution
        inputs = state.get("inputs", {})
        
        print(f"[START] Workflow execution started with inputs: {list(inputs.keys())}")
        
        return PrimitiveResult(
            success=True,
            output={"_started": True, **inputs},
            error=None
        )
