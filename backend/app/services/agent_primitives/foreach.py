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
                "steps": {
                    "type": "array",
                    "items": {"type": "object"},
                    "description": "List of steps to execute for each item (alternative to subprocess_graph)"
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
            steps = params.get("steps")
            output_var = params.get("output_variable", "foreach_results")
            
            # If steps provided instead of graph, wrap it
            if not subprocess_graph and steps:
                subprocess_graph = {"steps": steps}
            
            # Get the list from state variables
            # Get the list from state variables
            variables = state.get("variables", {})
            try:
                items = self._get_nested_value(variables, items_var)
            except KeyError:
                print(f"[ForEach] WARNING: Key '{items_var}' not found. Defaulting to empty list.")
                items = []
            
            results: List[Any] = []
            
            # Ensure items is valid
            if items is None:
                 print(f"[ForEach] WARNING: Items list '{items_var}' is None. Defaulting to empty list.")
                 items = []

            if not isinstance(items, list):
                 # Try to force list?
                 if isinstance(items, dict):
                      items = [items]
                 else:
                      print(f"[ForEach] WARNING: '{items_var}' is {type(items)}, not list. Wrapping.")
                      items = [items]

            # If there's a subprocess graph, we need the runtime to execute it
            if subprocess_graph:
                return PrimitiveResult(
                    success=True,
                    output={
                        "_foreach_items": items,
                        "_foreach_iterator": iterator_var,
                        "_foreach_index": index_var,
                        "_foreach_subprocess": subprocess_graph,
                        output_var: [] 
                    }
                )
            
            # Simple manual enumeration (if no subgraph)
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
            # Fallback for critical failure
            print(f"[ForEach] CRITICAL FAILURE: {e}")
            return PrimitiveResult(
                success=False,
                error=f"ForEach failed: {str(e)}"
            )
