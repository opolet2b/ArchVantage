"""
Text Template Primitive

Formats text strings using Jinja2 templating.
"""
from typing import Any, Dict
from jinja2 import Template, Environment, BaseLoader, UndefinedError
from app.services.agent_primitives.base import BasePrimitive, PrimitiveResult


class TextTemplatePrimitive(BasePrimitive):
    """
    Primitive for formatting text strings using Jinja2.
    
    Supports variable interpolation and basic template logic.
    """
    
    @property
    def name(self) -> str:
        return "TEXT_TEMPLATE"
    
    @property
    def description(self) -> str:
        return "Formats text strings using Jinja2 templating."
    
    @property
    def param_schema(self) -> Dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "template_string": {
                    "type": "string",
                    "description": "Jinja2 template string"
                },
                "variables": {
                    "type": "object",
                    "description": "Additional variables to inject",
                    "default": {}
                },
                "output_variable": {
                    "type": "string",
                    "description": "Variable name to store the result",
                    "default": "formatted_text"
                }
            },
            "required": ["template_string"]
        }
    
    async def execute(
        self, 
        params: Dict[str, Any], 
        state: Dict[str, Any]
    ) -> PrimitiveResult:
        """Render a Jinja2 template with variables."""
        try:
            template_string = params.get("template_string", "")
            extra_variables = params.get("variables", {})
            output_var = params.get("output_variable", "formatted_text")
            
            # Merge state variables with extra variables
            all_variables = {**state.get("variables", {}), **extra_variables}
            
            # Also include secrets (they should be decrypted already)
            all_variables["secrets"] = state.get("secrets", {})
            
            # Create Jinja2 environment with sandboxed settings
            env = Environment(
                loader=BaseLoader(),
                autoescape=True  # Auto-escape for security
            )
            
            # Render the template
            template = env.from_string(template_string)
            result = template.render(**all_variables)
            
            return PrimitiveResult(
                success=True,
                output={
                    output_var: result,
                    "_raw": result
                }
            )
            
        except UndefinedError as e:
            return PrimitiveResult(
                success=False,
                error=f"Template variable not found: {str(e)}"
            )
        except Exception as e:
            return PrimitiveResult(
                success=False,
                error=f"Template rendering failed: {str(e)}"
            )
