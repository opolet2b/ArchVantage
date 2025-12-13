"""
ForEach Primitive

Iterates over a list and executes a subprocess for each item.
"""
from typing import Any, Dict, List
from app.services.agent_primitives.base import BasePrimitive, PrimitiveResult


class ForEachPrimitive(BasePrimitive):
    """
    Primitive for iterating over lists.
    
    Executes a sub-workflow for each item in the list.
    """
    
    @property
    def name(self) -> str:
        return "FOREACH"
    
    @property
    def description(self) -> str:
        return "Iterates over a list and executes a subprocess for each item."
    
    @property
    def param_schema(self) -> Dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "items": {
                    "type": "string",
                    "description": "Variable name containing the list to iterate"
                },
                "iterator_var": {
                    "type": "string",
                    "description": "Variable name for the current item",
                    "default": "item"
                },
                "index_var": {
                    "type": "string",
                    "description": "Variable name for the current index",
                    "default": "index"
                },
                "subprocess_graph": {
                    "type": "object",
                    "description": "Sub-graph to execute for each item"
                },
                "output_variable": {
                    "type": "string",
                    "description": "Variable name to store all results",
                    "default": "foreach_results"
                }
            },
            "required": ["items"]
        }
    
    async def execute(
        self, 
        params: Dict[str, Any], 
        state: Dict[str, Any]
    ) -> PrimitiveResult:
        """Iterate over items and collect results."""
        try:
            items_var = params.get("items", "")
            iterator_var = params.get("iterator_var", "item")
            index_var = params.get("index_var", "index")
            subprocess_graph = params.get("subprocess_graph")
            output_var = params.get("output_variable", "foreach_results")
            
            # Get the list from state variables
            variables = state.get("variables", {})
            items = self._get_nested_value(variables, items_var)
            
            if not isinstance(items, list):
                return PrimitiveResult(
                    success=False,
                    error=f"'{items_var}' is not a list"
                )
            
            results: List[Any] = []
            
            # If there's a subprocess graph, we need the runtime to execute it
            # For now, just collect items with their indices
            if subprocess_graph:
                # This will be handled by the agent_runtime 
                # which will recursively execute the sub-graph
                return PrimitiveResult(
                    success=True,
                    output={
                        "_foreach_items": items,
                        "_foreach_iterator": iterator_var,
                        "_foreach_index": index_var,
                        "_foreach_subprocess": subprocess_graph,
                        output_var: []  # Will be populated by runtime
                    }
                )
            
            # Simple case: just enumerate the items
            for idx, item in enumerate(items):
                results.append({
                    iterator_var: item,
                    index_var: idx
                })
            
            return PrimitiveResult(
                success=True,
                output={
                    output_var: results,
                    "_raw": results
                }
            )
            
        except Exception as e:
            return PrimitiveResult(
                success=False,
                error=f"ForEach failed: {str(e)}"
            )
