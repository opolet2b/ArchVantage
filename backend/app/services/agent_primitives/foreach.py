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
            
            self._log_debug(f"Executing with items_var='{items_var}', iterator='{iterator_var}'", state)

            # If steps provided instead of graph, wrap it
            if not subprocess_graph and steps:
                subprocess_graph = {"steps": steps}
                self._log_debug(f"Converted {len(steps)} steps to subprocess_graph", state)
            
            # Resolve items from template or variable name
            items = self.resolve_variables(items_var, state)
            if not isinstance(items, list):
                # Fallback: maybe it's just a raw variable name (with or without {{ }})
                clean_var = str(items_var).strip("{} ").strip()
                variables = state.get("variables", {})
                try:
                    items = self._get_nested_value(variables, clean_var)
                except (KeyError, TypeError):
                    items = []
            
            self._log_debug(f"Resolved items: {len(items) if isinstance(items, list) else 'N/A'}", state)
            
            results: List[Any] = []
            
            # Ensure items is valid
            if items is None:
                 self._log_debug(f"WARNING: Items list '{items_var}' is None. Defaulting to empty list.", state)
                 items = []

            if not isinstance(items, list):
                 # Try to force list?
                 if isinstance(items, dict):
                      items = [items]
                      self._log_debug("Wrapped single dict item into list", state)
                 else:
                      self._log_debug(f"WARNING: '{items_var}' is {type(items)}, not list. Wrapping.", state)
                      items = [items]

            self._log_debug(f"Final items count for iteration: {len(items)}", state)

            # If there's a subprocess graph, we need the runtime to execute it
            if subprocess_graph:
                self._log_debug("Subprocess graph detected. Handing off to runtime.", state)
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
            self._log_debug("No subprocess graph. Performing manual enumeration.", state)
            for idx, item in enumerate(items):
                results.append({
                    iterator_var: item,
                    index_var: idx
                })
            
            self._log_debug(f"Manual enumeration complete. {len(results)} results.", state)
            return PrimitiveResult(
                success=True,
                output={
                    output_var: results,
                    "_raw": results
                }
            )

        except Exception as e:
            # Fallback for critical failure
            self._log_debug(f"CRITICAL FAILURE: {e}", state)
            return PrimitiveResult(
                success=False,
                error=f"ForEach failed: {str(e)}"
            )
