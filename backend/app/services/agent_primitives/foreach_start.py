"""
ForEach Start Primitive

Begins a loop over a list of items.
Acts as both the entry point and the re-entry point for the loop.
"""
from typing import Any, Dict, List
from app.services.agent_primitives.base import BasePrimitive, PrimitiveResult

class ForEachStartPrimitive(BasePrimitive):
    """
    Primitive that starts a For-Each loop.
    
    It maintains the loop state (index, current item) in the variables.
    It has two logical outputs (via branching):
    1. Body: Execute next iteration (if items remaining)
    2. Done: Loop finished
    """
    
    @property
    def name(self) -> str:
        return "FOREACH_START"
    
    @property
    def description(self) -> str:
        return "Begins a loop over a list of items."
    
    @property
    def param_schema(self) -> Dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "items": {
                    "type": "string",
                    "description": "Variable containing the list to iterate (e.g. {{inputs.list}})"
                },
                "iterator_var": {
                    "type": "string",
                    "description": "Variable name for current item",
                    "default": "item"
                },
                "index_var": {
                    "type": "string",
                    "description": "Variable name for current index",
                    "default": "index"
                },
                "results_var": {
                     "type": "string",
                     "description": "Variable to store collected results",
                     "default": "results"
                }
            },
            "required": ["items"]
        }
    
    async def execute(
        self, 
        params: Dict[str, Any], 
        state: Dict[str, Any]
    ) -> PrimitiveResult:
        """
        Execute loop logic.
        
        Determines if we are starting a new loop or continuing one.
        """
        try:
            # 1. Get Parameters
            items_ref = params.get("items", "")
            iterator_var = params.get("iterator_var", "item")
            index_var = params.get("index_var", "index")
            results_var = params.get("results_var", "results")
            
            # Get variables for later use
            variables = state.get("variables", {})
            
            # 2. Resolve Items List (Robust Multi-Stage Resolution)
            items = None
            print(f"\n[DEBUG FOREACH] Target Ref: '{items_ref}'")
            print(f"[DEBUG FOREACH] Available Variables: {list(variables.keys())}")
            
            try:
                # Strategy 1: Standard template resolution
                items = self.resolve_variables(items_ref, state)
                print(f"[DEBUG FOREACH] Strategy 1 (Template) Result: {str(items)[:100]}")
                
                if isinstance(items, str) and items == items_ref:
                    # Strategy 2: Raw path resolution
                    clean_ref = items_ref.strip("{} ")
                    print(f"[DEBUG FOREACH] Strategy 2 (Path) attempting: '{clean_ref}'")
                    resolved_raw = self._resolve_single_variable(clean_ref, state)
                    if resolved_raw is not None:
                        items = resolved_raw
                        print(f"[DEBUG FOREACH] Strategy 2 Success. Type: {type(items)}")
                
                if items is None or (isinstance(items, str) and items == items_ref):
                    print(f"[DEBUG FOREACH] Strategy 3 (Direct) fallback for: '{items_ref}'")
                    items = variables.get(items_ref)
            
            except Exception as e:
                print(f"[DEBUG FOREACH] ERROR: {e}")
                items = []

            # Final check
            if items is None:
                print("[DEBUG FOREACH] Final Result: None -> defaulting to []")
                items = []
            elif not isinstance(items, list):
                print(f"[DEBUG FOREACH] Final Result: {type(items)} -> wrapping in list")
                items = [items]
            else:
                print(f"[DEBUG FOREACH] Final Result: List with {len(items)} items.")

            # Log final resolution state
            debug_msg = f"[FOREACH_START] RESOLUTION for '{items_ref}': "
            if items is None:
                debug_msg += "FAILED (returned None)"
                items = []
            elif isinstance(items, list):
                debug_msg += f"SUCCESS (found list with {len(items)} items)"
            else:
                debug_msg += f"PARTIAL (found {type(items)}, wrapping)"
                items = [items]
            
            # Persistent Debug Logging
            try:
                import datetime
                with open("execution_debug.log", "a", encoding="utf-8") as f:
                    f.write(f"\n[{datetime.datetime.utcnow().isoformat()}] == FOREACH RESOLUTION ==\n")
                    f.write(f"Ref: {items_ref}\n")
                    f.write(f"Result Type: {type(items)}\n")
                    f.write(f"Items Count: {len(items)}\n")
                    f.write(f"Available Variables Snippet: {str(list(variables.keys())[:20])}\n")
                    f.write(f"Status: {debug_msg}\n")
                    f.write("="*50 + "\n")
            except:
                pass
                
            # 3. Handle Table Data (Array of Arrays with Headers)
            # If the input looks like a table [ [h1, h2], [v1, v2] ], convert rows to dicts
            is_table = False
            headers = []
            if len(items) > 1 and all(isinstance(i, list) for i in items[:2]):
                is_table = True
                headers = [str(h).strip() for h in items[0]]
                # Slice items to skip header row for iteration
                items = items[1:]
                print(f"[DEBUG FOREACH] Detected table input with {len(headers)} columns. Converting {len(items)} rows to objects.")

            loop_state_key = f"_loop_state_{iterator_var}_{index_var}"
            current_index = variables.get(loop_state_key, -1)
            next_index = current_index + 1
            
            # 4. Check Termination
            if next_index < len(items):
                # CONTINUE
                current_raw_item = items[next_index]
                
                # If it was a table, convert this row to a dictionary using headers
                if is_table and isinstance(current_raw_item, list):
                    current_item = {}
                    for i, header in enumerate(headers):
                        if i < len(current_raw_item):
                            current_item[header] = current_raw_item[i]
                else:
                    current_item = current_raw_item
                
                # Update State
                output_vars = {
                    iterator_var: current_item,
                    index_var: next_index,
                    loop_state_key: next_index
                }
                
                # If start of loop, also init the results array
                if next_index == 0:
                     print(f"[DEBUG FOREACH_START] Initializing new list for variable '{results_var}' at index 0")
                     output_vars[results_var] = []
                else:
                     existing_results = variables.get(results_var, [])
                     print(f"[DEBUG FOREACH_START] Iteration {next_index}. Variable '{results_var}' count: {len(existing_results)}")
                
                return PrimitiveResult(
                    success=True,
                    output={
                        **output_vars,
                        "logical_branch": "body"
                    }
                )
                
            else:
                # DONE
                # Clean up internal state?
                # output_vars = { loop_state_key: None } # Optional
                
                # Fetch the results from state so they are explicitly yielded on completion
                final_results = variables.get(results_var, [])
                
                return PrimitiveResult(
                    success=True,
                    output={
                        "loop_status": "done",
                        "logical_branch": "done",
                        results_var: final_results
                    }
                )

        except Exception as e:
            return PrimitiveResult(success=False, error=str(e))

