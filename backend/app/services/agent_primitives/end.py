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
                    "description": "Legacy: List of variable names to include."
                },
                "output_template": {
                    "type": "object",
                    "description": "Mapping of keys to variable paths (e.g. { 'processed_items': '{{results}}' })"
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
        output_template = params.get("output_template")
        output_vars = params.get("output_variables", [])
        
        final_output = {}
        
        if output_template and isinstance(output_template, dict) and len(output_template) > 0:
            # Use the template to construct the output
            # Logic mirrors AgentRuntime's final output construction
            print(f"[END] Constructing output using template: {output_template}")
            
            for key, template_str in output_template.items():
                if not isinstance(template_str, str):
                    final_output[key] = template_str
                    continue
                
                # Check for direct variable match first
                if template_str in variables:
                    final_output[key] = variables[template_str]
                else:
                    # Try Jinja2 rendering if it contains {{ }}
                    if "{{" in template_str:
                        try:
                            import jinja2
                            env = jinja2.Environment()
                            tmpl = env.from_string(template_str)
                            final_output[key] = tmpl.render(**variables)
                        except Exception as e:
                            print(f"[END ERROR] Template render failed for {key}: {e}")
                            final_output[key] = template_str # Fallback
                    else:
                        final_output[key] = template_str
                        
        elif output_vars:
            # If specific output variables are requested (Legacy), filter them
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
