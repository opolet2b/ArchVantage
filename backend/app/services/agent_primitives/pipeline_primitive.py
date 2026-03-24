
from typing import Any, Dict, List
from app.services.agent_primitives.base import BasePrimitive, PrimitiveResult

class GenericPipelinePrimitive(BasePrimitive):
    """
    Primitive that executes a linear sequence of other primitives.
    Acts as a meta-executor for automations defined as a list of steps.
    """
    
    @property
    def name(self) -> str:
        return "EXECUTE_PIPELINE"
    
    @property
    def description(self) -> str:
        return "Executes a defined list of primitive steps sequentially."
    
    @property
    def param_schema(self) -> Dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "steps": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "primitive": {"type": "string"},
                            "inputs": {"type": "object"}
                        },
                        "required": ["primitive"]
                    },
                    "description": "List of steps to execute"
                }
            },
            "required": ["steps"]
        }
    
    async def execute(
        self, 
        params: Dict[str, Any], 
        state: Dict[str, Any]
    ) -> PrimitiveResult:
        steps = params.get("steps", [])
        results = {}
        
        self._log_debug(f"Starting pipeline with {len(steps)} steps.", state)
        
        for i, step in enumerate(steps):
            primitive_name = step.get("primitive")
            step_inputs = step.get("inputs", {})
            step_id = step.get("id", f"step_{i}")
            node_label = step.get("metadata", {}).get("label") or step.get("label") or f"Step {i+1}"
            
            self._log_debug(f"Executing [{node_label}]: {primitive_name}", state)
            
            # Resolve inputs with current state
            resolved_inputs = {}
            for k, v in step_inputs.items():
                if isinstance(v, str) and "{{" in v:
                    resolved_inputs[k] = self.resolve_variables(v, state)
                else:
                    resolved_inputs[k] = v
                    
            # Get Primitive
            from app.services.agent_primitives import get_primitive
            try:
                primitive = get_primitive(primitive_name)
            except ValueError:
                return PrimitiveResult(success=False, error=f"Primitive '{primitive_name}' not found at step {i}")
            
            # Execute
            try:
                result = await primitive.execute(resolved_inputs, state)
                if not result.success:
                    self._log_debug(f"FAILED [{node_label}]: {result.error}", state)
                    if state.get("db"):
                        state["db"].rollback()
                        self._log_debug(f"Database session rolled back after failure at [{node_label}]", state)
                    return PrimitiveResult(success=False, error=f"Step {i} ({primitive_name}) failed: {result.error}")
                
                # --- HANDLE FOREACH HANDOFF ---
                if isinstance(result.output, dict) and "_foreach_subprocess" in result.output:
                    try:
                        from app.services.agent_runtime import AgentRuntime
                        subprocess_def = result.output["_foreach_subprocess"]
                        items = result.output.get("_foreach_items", [])
                        iterator_var = result.output.get("_foreach_iterator", "item")
                        index_var = result.output.get("_foreach_index", "index")
                        target_output_var = next((k for k in result.output.keys() if not k.startswith("_")), "foreach_results")

                        self._log_debug(f"[{node_label}] Triggering loop for {len(items)} items...", state)

                        # Capture the initial variables before the loop to ensure iterations are independent
                        initial_loop_variables = state["variables"].copy() if "variables" in state else {}
                        
                        subprocess_results = []
                        all_harvested_vars = {} # Accumulate across all iterations
                        
                        for idx, item in enumerate(items):
                            self._log_debug(f"  -> Processing item {idx+1}/{len(items)}...", state)
                            
                            # Start with the initial parent variables, NOT the modified ones from previous iterations
                            sub_inputs = initial_loop_variables.copy() 
                            sub_inputs[iterator_var] = item
                            sub_inputs["item"] = item # Default fallback
                            sub_inputs[index_var] = idx
                            sub_inputs["index"] = idx # Default fallback
                            
                            sub_blueprint = {"graph": subprocess_def}
                            sub_runtime = AgentRuntime(sub_blueprint, state.get("db"))
                            
                            sub_res = await sub_runtime.execute(sub_inputs)
                            
                            # Collect outputs
                            item_out = sub_res.get("outputs", {})

                            # CAPTURE NEW VARIABLES from sub-state
                            # sub_res["execution_state"] is usually the variables map directly.
                            harvested_vars = {}
                            final_vars = sub_res.get("execution_state") or {}
                            if isinstance(final_vars, dict) and "variables" in final_vars:
                                final_vars = final_vars["variables"]

                            if isinstance(final_vars, dict):
                                for k, v in final_vars.items():
                                        if k.startswith("_"): continue
                                        # If it's a new variable OR it changed from the initial sub_input
                                        if k not in sub_inputs or v != sub_inputs.get(k):
                                            harvested_vars[k] = v
                                
                                # Use harvested vars for iteration results
                                iteration_out = item_out.copy() if isinstance(item_out, dict) else {}
                                iteration_out.update(harvested_vars)
                                
                                subprocess_results.append(iteration_out)
                                
                                # --- VARIABLE PROPAGATION ---
                                # Merge harvested variables back to the parent state
                                if harvested_vars:
                                    self._log_debug(f"[{node_label}] (Item {idx}) VARIABLE HARVESTED: {list(harvested_vars.keys())}", state)
                                    all_harvested_vars.update(harvested_vars)

                        # --- FINAL VARIABLE PROPAGATION ---
                        # Merge all harvested variables back to the parent state after the loop
                        if all_harvested_vars:
                            if "variables" not in state: state["variables"] = {}
                            state["variables"].update(all_harvested_vars)
                            self._log_debug(f"[{node_label}] Global propagation of {len(all_harvested_vars)} variables.", state)

                        # Update results with aggregated loop data
                        result.output[target_output_var] = subprocess_results
                        self._log_debug(f"[{node_label}] Loop complete. {len(subprocess_results)} items processed.", state)

                    except Exception as loop_e:
                        self._log_debug(f"[{node_label}] Loop execution failed: {loop_e}", state)
                        return PrimitiveResult(success=False, error=f"Loop in '{node_label}' failed: {str(loop_e)}")

                # Update State/Variables with output
                if result.output:
                    # Merge into variables for future steps
                    if "variables" not in state: state["variables"] = {}
                    state["variables"].update(result.output)
                    results[step_id] = result.output
                    
                    # Also update current_output for context discovery
                    state["current_output"] = result.output
                    
            except Exception as e:
                self._log_debug(f"EXCEPTION at [{node_label}]: {e}", state)
                if state.get("db"):
                    state["db"].rollback()
                    self._log_debug(f"Database session rolled back after exception at [{node_label}]", state)
                return PrimitiveResult(success=False, error=f"Exception at step {i} ({primitive_name}): {str(e)}")
                
        # Check if any step required visual realization
        realization_required = False
        for step_res in results.values():
            if isinstance(step_res, dict) and step_res.get("realization_required"):
                realization_required = True
                break
                
        return PrimitiveResult(
            success=True, 
            output={
                "pipeline_results": results,
                "realization_required": realization_required
            }
        )
