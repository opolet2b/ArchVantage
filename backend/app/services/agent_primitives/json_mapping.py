"""
JSON Mapping Primitive

Transforms and extracts data from JSON using JMESPath expressions.
"""
from typing import Any, Dict
import jmespath
from app.services.agent_primitives.base import BasePrimitive, PrimitiveResult


class JSONMappingPrimitive(BasePrimitive):
    """
    Primitive for transforming and extracting JSON data.
    
    Uses JMESPath for powerful query expressions.
    """
    
    @property
    def name(self) -> str:
        return "JSON_MAPPING"
    
    @property
    def description(self) -> str:
        return "Transforms and extracts data from JSON using JMESPath."
    
    @property
    def param_schema(self) -> Dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "source": {
                    "type": "string",
                    "description": "Variable name containing the source JSON"
                },
                "template": {
                    "type": "string",
                    "description": "JMESPath expression for extraction"
                },
                "output_variable": {
                    "type": "string",
                    "description": "Variable name to store the result",
                    "default": "mapped_data"
                }
            },
            "required": ["source", "template"]
        }
    
    async def execute(
        self, 
        params: Dict[str, Any], 
        state: Dict[str, Any]
    ) -> PrimitiveResult:
        """Extract/transform JSON data using configured mappings or JMESPath."""
        try:
            source_var = params.get("source", "")
            template = params.get("template", "")
            output_var = params.get("output_variable", "mapped_data")
            mappings = params.get("mappings", [])  # New: array of {source, target}
            
            # Get the source data from state
            variables = state.get("variables", {})
            current_output = state.get("current_output", {})
            
            print(f"[JSON_MAPPING] source_var: {source_var}")
            print(f"[JSON_MAPPING] template: {template}")
            print(f"[JSON_MAPPING] mappings: {mappings}")
            print(f"[JSON_MAPPING] variables keys: {list(variables.keys())}")
            print(f"[JSON_MAPPING] current_output: {current_output}")
            
            # Combined source: current_output merged with variables
            combined_source = {**variables, **(current_output or {})}
            
            output = {}
            
            # Execute configured mappings (new UI-based approach)
            if mappings and isinstance(mappings, list):
                for mapping in mappings:
                    source_path = mapping.get("source", "")
                    target_key = mapping.get("target", "")
                    
                    if source_path and target_key:
                        value = None
                        value_found = False
                        
                        # Strategy 1: Try direct key access first (most common)
                        if source_path in combined_source:
                            value = combined_source[source_path]
                            value_found = True
                            print(f"[JSON_MAPPING] Found {source_path} via direct access: {value}")
                        
                        # Strategy 2: Try via 'values' dict (GUI tools put data here)
                        if not value_found and "values" in combined_source:
                            values_dict = combined_source.get("values", {})
                            if isinstance(values_dict, dict) and source_path in values_dict:
                                value = values_dict[source_path]
                                value_found = True
                                print(f"[JSON_MAPPING] Found {source_path} via values dict: {value}")
                        
                        # Strategy 3: Try nested path access
                        if not value_found:
                            try:
                                value = self._get_nested_value(combined_source, source_path)
                                value_found = True
                                print(f"[JSON_MAPPING] Found {source_path} via nested access: {value}")
                            except (KeyError, IndexError, TypeError) as e:
                                print(f"[JSON_MAPPING] Nested access failed for {source_path}: {e}")
                        
                        # Strategy 4: Try searching in current_output dict values
                        if not value_found and current_output:
                            for key, val in current_output.items():
                                if isinstance(val, dict) and source_path in val:
                                    value = val[source_path]
                                    value_found = True
                                    print(f"[JSON_MAPPING] Found {source_path} in current_output.{key}: {value}")
                                    break
                        
                        if value_found:
                            output[target_key] = value
                            print(f"[JSON_MAPPING] Mapped {source_path} -> {target_key}: {value}")
                        else:
                            print(f"[JSON_MAPPING] Could not find value for {source_path}")
                            print(f"[JSON_MAPPING] combined_source keys: {list(combined_source.keys())}")
                            output[target_key] = None
            
            # If no mappings, fall back to JMESPath approach
            if not output:
                source_data = None
                
                # Try to get source data by variable path
                if source_var:
                    try:
                        source_data = self._get_nested_value(variables, source_var)
                    except (KeyError, IndexError, TypeError) as e:
                        print(f"[JSON_MAPPING] Could not get '{source_var}': {e}")
                
                # Fallback: use current_output if source not found
                if source_data is None and current_output:
                    print("[JSON_MAPPING] Using current_output as source")
                    source_data = current_output
                
                # Fallback: use entire variables dict
                if source_data is None:
                    print("[JSON_MAPPING] Using entire variables dict as source")
                    source_data = variables
                
                print(f"[JSON_MAPPING] source_data: {source_data}")
                
                # Apply JMESPath expression
                if template:
                    result = jmespath.search(template, source_data)
                else:
                    # No template means pass through the source data
                    result = source_data
                
                output = {
                    output_var: result,
                    "result": result,
                    "_raw": result
                }
            
            print(f"[JSON_MAPPING] output: {output}")
            
            return PrimitiveResult(
                success=True,
                output=output
            )
            
        except jmespath.exceptions.JMESPathError as e:
            return PrimitiveResult(
                success=False,
                error=f"JMESPath error: {str(e)}"
            )
        except Exception as e:
            return PrimitiveResult(
                success=False,
                error=f"JSON mapping failed: {str(e)}"
            )

