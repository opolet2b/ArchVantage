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
            # We try different strategies to find the list variable the user specified
            items = None
            print(f"[FOREACH_START] Attempting resolution for: '{items_ref}'")
            try:
                # Strategy 1: Standard template resolution (handles {{inputs.list}})
                items = self.resolve_variables(items_ref, state)
                print(f"[FOREACH_START] Strategy 1 (Template) result type: {type(items)}")
                
                # If Strategy 1 returned the same string, it means it didn't find any {{ }} braces
                # or the braces didn't resolve to anything.
                if isinstance(items, str) and items == items_ref:
                    # Strategy 2: Raw path resolution (handles "inputs.list" or "node_id.field")
                    clean_ref = items_ref.strip()
                    if clean_ref.startswith("{{") and clean_ref.endswith("}}"):
                        clean_ref = clean_ref[2:-2].strip()
                    
                    print(f"[FOREACH_START] Strategy 2 (Path) attempting for: '{clean_ref}'")
                    resolved_raw = self._resolve_single_variable(clean_ref, state)
                    if resolved_raw is not None:
                        items = resolved_raw
                        print(f"[FOREACH_START] Strategy 2 success. Type: {type(items)}")
                
                # Strategy 3: Direct variables fallback
                if items is None or (isinstance(items, str) and items == items_ref):
                    print(f"[FOREACH_START] Strategy 3 (Direct) fallback for: '{items_ref}'")
                    items = variables.get(items_ref)
                    if items is not None:
                        print(f"[FOREACH_START] Strategy 3 success. Type: {type(items)}")
                
            except Exception as e:
                print(f"[FOREACH_START] ERROR during resolution of '{items_ref}': {e}")
                items = []

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
                
            # 3. Determine Loop State
            # We store loop state in a special internal variable to track progress
            # Key collision avoidance: Use node ID? 
            # Ideally we need the node_id of THIS node.
            # But params doesn't give us node_id easily unless we pass it? 
            # We can use a combination of variable names or rely on the fact 
            # that we re-enter this node.
            
            # Let's use a convention: _loop_state_{iterator_var} 
            # Or better, just check if index_var exists and if we received a "CONTINUE" signal?
            # Issue: If we just check index_var, we might be restarting a loop that wasn't cleaned up?
            # Safe bet: Look for a specific "signal" that the END node set.
            
            loop_state_key = f"_loop_state_{iterator_var}_{index_var}"
            current_index = variables.get(loop_state_key, -1)
            
            # Logic:
            # If we are called, we increment the index.
            # EXCEPT: If this is the *very first* time?
            # Implementation detail: The END node points back here.
            # So every time we are called, we simply take the Next item.
            # If current_index is -1 (not set), start at 0.
            
            next_index = current_index + 1
            
            # 4. Check Termination
            if next_index < len(items):
                # CONTINUE
                current_item = items[next_index]
                
                # Update State
                output_vars = {
                    iterator_var: current_item,
                    index_var: next_index,
                    loop_state_key: next_index
                }
                
                # If start of loop, also init the results array
                if next_index == 0:
                     output_vars[results_var] = []
                
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

