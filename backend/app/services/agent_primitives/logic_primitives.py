"""
Logic and Cross-Canvas Primitives

Primitives for conditional logic, cross-canvas querying, and linking.
"""
import re
import json
from typing import Any, Dict, List, Optional
from sqlalchemy.orm import Session
from app.services.agent_primitives.base import BasePrimitive, PrimitiveResult
from app.models.canvas_models import CanvasThing, CanvasLink, Canvas
from app.services.llm_service import llm_service

class LogicIfElsePrimitive(BasePrimitive):
    """
    Primitive for conditional logic, evaluating a condition and routing to 'then' or 'else' nodes.
    Supports simple and iterative modes, using an LLM for natural language condition evaluation.
    """
    
    @property
    def name(self) -> str:
        return "LOGIC_IF_ELSE"
    
    @property
    def description(self) -> str:
        return "Evaluates a condition and routes to 'then' or 'else' based on the result."
    
    @property
    def param_schema(self) -> Dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "condition": {
                    "type": "string",
                    "description": "The condition to evaluate (e.g., 'is greater than', 'contains', 'is true')."
                },
                "context": {
                    "type": "string",
                    "description": "The primary value or context to evaluate (e.g., '{{item.status}}', 'The user's input')."
                },
                "compare_value": {
                    "type": "string",
                    "description": "Optional value to compare against (e.g., 'completed', 'yes')."
                },
                "mode": {
                    "type": "string",
                    "enum": ["simple", "iterative"],
                    "default": "simple",
                    "description": "Evaluation mode: 'simple' for a single condition, 'iterative' for a list of items."
                },
                "items": {
                    "type": "string",
                    "description": "Required for 'iterative' mode. A JSON string or variable reference to a list of items."
                },
                "iterator_var": {
                    "type": "string",
                    "default": "item",
                    "description": "The variable name to use for each item during iterative evaluation."
                },
                "then_steps": {
                    "type": "array",
                    "items": {"type": "object"},
                    "description": "Steps to execute if condition is True"
                },
                "else_steps": {
                    "type": "array",
                    "items": {"type": "object"},
                    "description": "Steps to execute if condition is False"
                }
            },
            "required": ["condition", "context"]
        }

    async def _evaluate_condition(self, condition: str, context: Any, compare_value: str, state: Dict[str, Any], label: str = "Condition", eval_type: str = "ai") -> tuple[bool, str]:
        """Evaluates a condition using the configured LLM or strict deterministic rules."""
        import json
        
        # Robustly handle non-string context
        if isinstance(context, (dict, list)):
            context_str = json.dumps(context, indent=2)
        elif context is None:
            context_str = ""
        else:
            context_str = str(context)

        # Check for strict deterministic mode
        strict_operators = ["is", "is exactly", "contains", "is not", "does not contain", "is greater than", "is less than", "is greater than or equal", "is less than or equal"]
        if eval_type == "strict" or condition in strict_operators:
            is_true = False
            c_str = str(context).strip().lower()
            cv_str = str(compare_value).strip().lower()
            if condition in ["is", "is exactly"]:
                is_true = (c_str == cv_str)
                reasoning = f"Strict check: '{c_str}' is exactly '{cv_str}'" if is_true else f"Strict check: '{c_str}' does not match '{cv_str}'"
            elif condition == "is not":
                is_true = (c_str != cv_str)
                reasoning = f"Strict check: '{c_str}' is indeed not '{cv_str}'" if is_true else f"Strict check: '{c_str}' matches '{cv_str}', which violates 'is not'"
            elif condition == "contains":
                is_true = (cv_str in c_str)
                reasoning = f"Strict check: '{c_str}' contains '{cv_str}'" if is_true else f"Strict check: '{c_str}' does not contain '{cv_str}'"
            elif condition == "does not contain":
                is_true = (cv_str not in c_str)
                reasoning = f"Strict check: '{c_str}' does not contain '{cv_str}'" if is_true else f"Strict check: '{c_str}' contains '{cv_str}', which violates 'does not contain'"
            elif condition in ["is greater than", "is less than", "is greater than or equal", "is less than or equal"]:
                try:
                    c_num = float(c_str)
                    cv_num = float(cv_str)
                    if condition == "is greater than":
                        is_true = c_num > cv_num
                        reasoning = f"Strict check: {c_num} is > {cv_num}" if is_true else f"Strict check: {c_num} is not > {cv_num}"
                    elif condition == "is less than":
                        is_true = c_num < cv_num
                        reasoning = f"Strict check: {c_num} is < {cv_num}" if is_true else f"Strict check: {c_num} is not < {cv_num}"
                    elif condition == "is greater than or equal":
                        is_true = c_num >= cv_num
                        reasoning = f"Strict check: {c_num} is >= {cv_num}" if is_true else f"Strict check: {c_num} is not >= {cv_num}"
                    elif condition == "is less than or equal":
                        is_true = c_num <= cv_num
                        reasoning = f"Strict check: {c_num} is <= {cv_num}" if is_true else f"Strict check: {c_num} is not <= {cv_num}"
                except ValueError:
                    is_true = False
                    reasoning = f"Strict check failed: Cannot compare non-numeric values '{c_str}' and '{cv_str}'."
            
            self._log_debug(f"[{label}] Strict Result: {is_true} | Reasoning: {reasoning}", state, extra={"reasoning": reasoning})
            return is_true, reasoning


        full_statement = condition
        if compare_value:
            full_statement = f"Check if context {condition} '{compare_value}'."

        self._log_debug(f"[{label}] Evaluating: '{full_statement}'", state, extra={
            "subject_preview": context_str[:100],
            "condition": condition,
            "against": compare_value
        })

        # Truncate context for LLM prompt
        display_context = context_str
        if len(display_context) > 2000:
            display_context = display_context[:2000] + "..."
        
        if not display_context.strip() or display_context == "{}":
            # If it's literally matches whitespace (e.g. user had "{{ var }} "), provide a hint
            if context_str and context_str.isspace():
                warning_msg = f"Evaluation Caution: Context resolved to whitespace ('{context_str}'). Check if your variable is empty or if you have extra spaces in your template."
            else:
                warning_msg = f"Evaluation skipped: Context resolved to empty/placeholder data. Check if your variable names are correct (current variables: {list(state.get('variables', {}).keys())})."
            
            display_context = "[No Context Provided]"
            if not compare_value:
                self._log_debug(f"[{label}] WARNING: {warning_msg}", state)
                return False, warning_msg

        prompt = f"""
        System: You are an expert AI logic engine. Your task is to evaluate the truth of a logical statement based ON THE PROVIDED CONTEXT.
        
        ### Context Data:
        {display_context}
        
        ### Instruction:
        Evaluate the following statement: "{full_statement}"
        
        Respond in this EXACT format:
        REASONING: <A clear, one-sentence explanation of why the statement is True or False, referencing specific details from the context if possible.>
        VERDICT: <TRUE/FALSE>
        """
        
        model_name = self.get_llm_config(state)
        from app.models.chat import Message
        
        import re
        decision_text_raw = await llm_service.chat(
            messages=[Message(role="user", content=prompt)],
            model_name=model_name, 
            temperature=0.0,
            strip_think=False
        )
        
        # Extract thinking
        think_match = re.search(r"<think>(.*?)</think>", decision_text_raw, flags=re.DOTALL | re.IGNORECASE)
        think_trace = ""
        if think_match:
            think_trace = think_match.group(1).strip()
            decision_text = re.sub(r"<think>.*?</think>", "", decision_text_raw, flags=re.DOTALL | re.IGNORECASE).strip()
        else:
            decision_text = decision_text_raw
        
        # Robust Verdict Extraction using regex
        verdict_match = re.search(r"VERDICT:\s*(TRUE|FALSE)", decision_text, re.IGNORECASE)
        if verdict_match:
            is_true = verdict_match.group(1).upper() == "TRUE"
        else:
            # Fallback to loose check if exact format missing
            is_true = "VERDICT: TRUE" in decision_text.upper() or (decision_text.upper().strip().endswith("TRUE") and "VERDICT:" in decision_text.upper())
            
        reasoning = ""
        if "REASONING:" in decision_text.upper():
            parts = re.split(r"VERDICT:", decision_text, flags=re.IGNORECASE)
            reasoning_part = parts[0]
            if "REASONING:" in reasoning_part.upper():
                reasoning = reasoning_part.split("REASONING:")[1].strip()
        
        self._log_debug(f"[{label}] Result: {is_true} | Reasoning: {reasoning[:200]}...", state, extra={"reasoning": reasoning})
        
        # Combine reasoning and thinking trace
        full_reasoning = reasoning
        if think_trace:
            full_reasoning = f"{reasoning}\n\n<think>\n{think_trace}\n</think>"
            
        return is_true, full_reasoning

    async def execute(self, params: Dict[str, Any], state: Dict[str, Any]) -> PrimitiveResult:
        mode = params.get("mode", "simple")
        condition = params.get("condition", "")
        context_template = params.get("context", "")
        compare_value_template = params.get("compare_value", "")
        then_steps = params.get("then_steps", [])
        else_steps = params.get("else_steps", [])
        
        # Extract label for better logging
        node_label = params.get("_node_label") or "Condition"
        variables = state.get("variables", {})
        self._log_debug(f"[{node_label}] Params: {list(params.keys())}", state)
        self._log_debug(f"[{node_label}] Available Variables: {list(variables.keys())}", state)
        self._log_debug(f"[{node_label}] Mode: {mode}", state)
        
        if mode == "iterative":
            items_raw = params.get("items", "[]")
            iterator_var = params.get("iterator_var", "item")
            
            # Resolve items
            items = self.resolve_variables(items_raw, state)
            if isinstance(items, str):
                import json
                try: items = json.loads(items)
                except: items = []
            elif not isinstance(items, list):
                items = []

            self._log_debug(f"[{node_label}] Resolving {len(items)} items for iteration.", state)

            results = []
            all_harvested_vars = {}
            parent_variables = state.get("variables", {}).copy()

            for idx, item in enumerate(items):
                # Prepare isolated sub-inputs for this iteration
                sub_inputs = parent_variables.copy()
                sub_inputs[iterator_var] = item
                sub_inputs["item"] = item # Default fallback
                sub_inputs["index"] = idx
                
                # We need a sub-state for the pipeline runner to avoid direct mutation of parent state
                sub_state = state.copy()
                sub_state["variables"] = sub_inputs
                
                # Resolve context and compare_value for this specific item using sub-state
                context = self.resolve_variables(context_template, sub_state)
                compare_value = self.resolve_variables(compare_value_template, sub_state)
                
                # Evaluate
                eval_type = params.get("eval_type", "ai")
                is_true, reasoning = await self._evaluate_condition(condition, context, compare_value, sub_state, label=node_label, eval_type=eval_type)
                
                # Execute branch
                steps_to_run = then_steps if is_true else else_steps
                branch_name = "TRUE (then)" if is_true else "FALSE (else)"
                num_steps = len(steps_to_run) if steps_to_run else 0
                self._log_debug(f"[{node_label}] (Iterative) Item {idx}: Executing branch: {branch_name} ({num_steps} internal steps)", state)

                branch_output = None
                if steps_to_run:
                    from app.services.agent_primitives.pipeline_primitive import GenericPipelinePrimitive
                    pipeline_runner = GenericPipelinePrimitive()
                    res = await pipeline_runner.execute({"steps": steps_to_run}, sub_state)
                    branch_output = res.output if res.success else {"error": res.error}

                    # Harvest variables from the sub-state
                    final_vars = sub_state.get("variables", {})
                    harvested_vars = {}
                    for k, v in final_vars.items():
                        if k.startswith("_"): continue
                        if k not in sub_inputs or v != sub_inputs.get(k):
                            harvested_vars[k] = v
                    
                    if harvested_vars:
                         self._log_debug(f"[{node_label}] (Item {idx}) VARIABLE HARVESTED: {list(harvested_vars.keys())}", state)
                         all_harvested_vars.update(harvested_vars)

                results.append({
                    "item_id": item.get("id") if isinstance(item, dict) else item,
                    "is_true": is_true,
                    "reasoning": reasoning,
                    "output": branch_output,
                    "realization_required": isinstance(branch_output, dict) and branch_output.get("realization_required", False)
                })

            # Merge all harvested variables back to the parent state after the loop
            if all_harvested_vars:
                if "variables" not in state: state["variables"] = {}
                state["variables"].update(all_harvested_vars)
                self._log_debug(f"[{node_label}] Global propagation of {len(all_harvested_vars)} variables from iterations.", state)

            # Check if any iteration required realization
            realization_required = any(r.get("realization_required") for r in results)

            return PrimitiveResult(
                success=True, 
                output={
                    "mode": "iterative",
                    "results": results,
                    "realization_required": realization_required,
                    "ai_insight": "\n".join([f"Item {r.get('item_id')}: {r.get('reasoning')}" for r in results])
                }
            )
        else:
            # Simple Mode
            context = self.resolve_variables(context_template, state)
            compare_value = self.resolve_variables(compare_value_template, state)
            eval_type = params.get("eval_type", "ai")
            
            # Evaluate
            is_true, reasoning = await self._evaluate_condition(condition, context, compare_value, state, label=node_label, eval_type=eval_type)
            
            # Execute branch
            steps_to_run = then_steps if is_true else else_steps
            branch_name = "TRUE (then)" if is_true else "FALSE (else)"
            num_steps = len(steps_to_run) if steps_to_run else 0
            self._log_debug(f"[{node_label}] Executing branch: {branch_name} ({num_steps} internal steps)", state)
            
            branch_output = None
            child_steps = None
            if steps_to_run:
                from app.services.agent_primitives.pipeline_primitive import GenericPipelinePrimitive
                pipeline_runner = GenericPipelinePrimitive()
                res = await pipeline_runner.execute({"steps": steps_to_run}, state)
                branch_output = res.output if res.success else {"error": res.error}
                if hasattr(res, "steps"):
                    child_steps = res.steps
            
            # Propagate realization flag if internal branch required it
            realization_required = isinstance(branch_output, dict) and branch_output.get("realization_required", False)
            
            return PrimitiveResult(
                success=True,
                output={
                    "is_true": is_true,
                    "reasoning": reasoning,
                    "logical_branch": "then" if is_true else "else",
                    "output": branch_output,
                    "realization_required": realization_required,
                    "ai_insight": reasoning
                },
                steps=child_steps
            )

class CanvasQueryPrimitive(BasePrimitive):
    """
    Search for things in a target canvas.
    """
    
    @property
    def name(self) -> str:
        return "CANVAS_QUERY"
    
    @property
    def description(self) -> str:
        return "Search for Things in a specific canvas."
    
    @property
    def param_schema(self) -> Dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "target_canvas_id": {"type": "string"},
                "query": {"type": "string"},
                "limit": {"type": "integer"}
            },
            "required": ["target_canvas_id"]
        }
    
    async def execute(self, params: Dict[str, Any], state: Dict[str, Any]) -> PrimitiveResult:
        db: Session = state.get("db")
        target_id = params.get("target_canvas_id")
        query = params.get("query", "")
        limit = int(params.get("limit", 5))
        
        if not db:
            return PrimitiveResult(success=False, error="DB session missing")
            
        # Basic Text Search
        # In a real impl, we'd use Full Text Search or Vector Search if available
        things = db.query(CanvasThing).filter(
            CanvasThing.canvas_id == target_id,
            (CanvasThing.title.ilike(f"%{query}%")) | (CanvasThing.content.cast(str).ilike(f"%{query}%"))
        ).limit(limit).all()
        
        results_json = []
        combined_content = ""
        for t in things:
            results_json.append({
                "id": t.id,
                "title": t.title,
                "type": t.type,
                "content": t.content
            })
            combined_content += f"--- ITEM: {t.title} ({t.type}) ---\n{t.content}\n\n"
            
        return PrimitiveResult(success=True, output={
            "query_results": {
                "things": results_json,
                "combined_content": combined_content.strip()
            }
        })

class CanvasCreateLinkPrimitive(BasePrimitive):
    """
    Create a semantic link between two items.
    """
    
    @property
    def name(self) -> str:
        return "CANVAS_CREATE_LINK"
    
    @property
    def description(self) -> str:
        return "Creates a link between two canvas items."
    
    @property
    def param_schema(self) -> Dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "source_id": {"type": "string"},
                "target_id": {"type": "string"},
                "label": {"type": "string"},
                "type": {"type": "string"},
                "description": {"type": "string"}
            },
            "required": ["source_id", "target_id"]
        }
    
    async def execute(self, params: Dict[str, Any], state: Dict[str, Any]) -> PrimitiveResult:
        db: Session = state.get("db")
        if not db:
            return PrimitiveResult(success=False, error="DB session missing")
            
        source_id = params.get("source_id")
        target_id = params.get("target_id")
        
        # Resolve variables
        if source_id and isinstance(source_id, str) and source_id.startswith("{{"):
            source_id = self.resolve_variables(source_id, state)
        if target_id and isinstance(target_id, str) and target_id.startswith("{{"):
            target_id = self.resolve_variables(target_id, state)
            
        # Ensure we have IDs (handle loop variables/objects)
        source_id = self._ensure_id(source_id)
        target_id = self._ensure_id(target_id)
            
        # The logic below is now partially redundant but kept for safety with other list types
        if isinstance(source_id, list):
            if len(source_id) > 0:
                self._log_debug(f"WARNING: source_id resolved to a list of {len(source_id)} items. Using the first one.", state)
                source_id = source_id[0]
            else:
                source_id = None
                
        if isinstance(target_id, list):
            if len(target_id) > 0:
                self._log_debug(f"WARNING: target_id resolved to a list of {len(target_id)} items. Using the first one.", state)
                target_id = target_id[0]
            else:
                target_id = None
        
        # Final safety check for dicts (in case list unwrapping returned a dict)
        source_id = self._ensure_id(source_id)
        target_id = self._ensure_id(target_id)
        
        canvas_id = state.get("canvas_id") or state.get("variables", {}).get("canvas_id")
        
        # Create Link
        new_link = CanvasLink(
            source_id=source_id,
            target_id=target_id,
            canvas_id=canvas_id, # Assume link is created on CURRENT canvas
            label=params.get("label"),
            type=params.get("type", "related"),
            description=params.get("description")
        )
        
        db.add(new_link)
        db.commit()
        db.refresh(new_link)
        
        return PrimitiveResult(success=True, output={"created_link_id": new_link.id})

class CanvasQueryThingsPrimitive(BasePrimitive):
    """
    Search for things on the canvas with advanced filtering.
    Supports filtering by domain, type, query string, and custom criteria.
    """
    
    @property
    def name(self) -> str:
        return "CANVAS_QUERY_THINGS"
    
    @property
    def description(self) -> str:
        return "Finds things on the canvas with optional domain, type, and criteria filters."
    
    @property
    def param_schema(self) -> Dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "domain_id": {
                    "type": "string",
                    "description": "Optional ID or Type of the domain to search within"
                },
                "thing_type": {
                    "type": "string",
                    "description": "Optional thing type filter (e.g., 'text', 'document')"
                },
                "query": {
                    "type": "string",
                    "description": "Optional search text for title and content"
                },
                "criteria": {
                    "type": "object",
                    "description": "Advanced criteria mapping for content/metadata fields"
                },
                "limit": {
                    "type": "integer",
                    "default": 10
                }
            },
            "required": []
        }
    
    async def execute(
        self, 
        params: Dict[str, Any], 
        state: Dict[str, Any]
    ) -> PrimitiveResult:
        db: Session = state.get("db")
        if not db:
            return PrimitiveResult(success=False, error="DB session missing from state")
            
        canvas_id = state.get("canvas_id") or state.get("variables", {}).get("canvas_id")
        if not canvas_id:
            return PrimitiveResult(success=False, error="Canvas ID not found in state")

        from app.models.canvas_models import Domain # Local import to avoid circularity if any
        
        # 1. Resolve domain if provided
        domain_filter_id = params.get("domain_id")
        actual_domain_id = None
        
        self._log_debug(f"Querying things on canvas '{canvas_id}' with domain_id='{domain_filter_id}'", state)

        if domain_filter_id:
            if isinstance(domain_filter_id, str) and domain_filter_id.startswith("{{"):
                domain_filter_id = self.resolve_variables(domain_filter_id, state)
            
            # Ensure we have an ID (handle loop items)
            domain_filter_id = self._ensure_id(domain_filter_id)
            
            # Check if it's an ID
            d = db.query(Domain).filter(Domain.id == domain_filter_id).first()
            if d:
                actual_domain_id = d.id
            else:
                # Check if it's a Type on this canvas
                d = db.query(Domain).filter(
                    Domain.canvas_id == canvas_id,
                    Domain.type == domain_filter_id
                ).first()
                if d:
                    actual_domain_id = d.id
                    self._log_debug(f"Resolved domain type '{domain_filter_id}' to ID '{actual_domain_id}'", state)
                else:
                    self._log_debug(f"WARNING: Domain '{domain_filter_id}' not found by ID or Type.", state)
        
        # 2. Build Query
        from sqlalchemy import or_, cast, String
        query_obj = db.query(CanvasThing).filter(CanvasThing.canvas_id == canvas_id)
        
        if actual_domain_id:
            query_obj = query_obj.filter(CanvasThing.domain_id == actual_domain_id)
            
        if params.get("thing_type") and params.get("thing_type") != "all":
            query_obj = query_obj.filter(CanvasThing.type == params.get("thing_type"))
            
        if params.get("query"):
            search_text = params.get("query")
            query_obj = query_obj.filter(
                or_(
                    CanvasThing.title.ilike(f"%{search_text}%"),
                    cast(CanvasThing.content, String).ilike(f"%{search_text}%")
                )
            )
            
        # 3. Limit and Execute
        limit = params.get("limit", 10)
        things = query_obj.limit(limit).all()
        
        self._log_debug(f"Database query found {len(things)} potential matches (limit: {limit})", state)
        
        # 4. Criteria Filtering in memory (complex JSON paths are better handled here or via LLM)
        # However, for performance and simplicity, we do a basic check if criteria provided.
        # Format: {"metadata.key": "value"}
        criteria = params.get("criteria", {})
        if isinstance(criteria, str):
            import json
            try:
                criteria = json.loads(criteria)
            except Exception:
                criteria = {}

        if criteria:
            matched_things = []
            for t in things:
                match = True
                content = t.content or {}
                for key, val in criteria.items():
                    # Support simple nesting like 'system_metadata.status'
                    parts = key.split('.')
                    target = content
                    for p in parts:
                        if isinstance(target, dict) and p in target:
                            target = target[p]
                        else:
                            match = False
                            break
                    if match and str(target) != str(val):
                        match = False
                    if not match:
                        break
                if match:
                    matched_things.append(t)
            things = matched_things

        results = []
        combined_content = ""
        for t in things:
            results.append({
                "id": t.id,
                "title": t.title,
                "type": t.type,
                "domain_id": t.domain_id,
                "content": t.content
            })
            combined_content += f"--- ITEM: {t.title} ({t.type}) ---\n{t.content}\n\n"
            
        return PrimitiveResult(success=True, output={
            "query_results": {
                "things": results,
                "count": len(results),
                "thing_ids": [t["id"] for t in results],
                "combined_content": combined_content.strip()
            }
        })

class LogicSetVariablePrimitive(BasePrimitive):
    """
    Primitive for setting custom variables in the workflow state.
    Simply returns its inputs as output, which the pipeline runner will merge into state.
    """
    
    @property
    def name(self) -> str:
        return "LOGIC_SET_VARIABLE"
    
    @property
    def description(self) -> str:
        return "Sets one or more variables in the workflow state."
    
    @property
    def param_schema(self) -> Dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "variables": {
                    "type": "object",
                    "description": "Key-value pairs of variables to set. Values can be templates like {{item.id}}"
                }
            },
            "required": ["variables"]
        }
    
    async def execute(self, params: Dict[str, Any], state: Dict[str, Any]) -> PrimitiveResult:
        variables_to_set = params.get("variables", {})
        
        resolved_vars = {}
        for k, v in variables_to_set.items():
            if isinstance(v, str) and "{{" in v:
                resolved_vars[k] = self.resolve_variables(v, state)
            else:
                resolved_vars[k] = v
                
        self._log_debug(f"Setting {len(resolved_vars)} variables", state, extra={"keys": list(resolved_vars.keys())})
        
        # Log individual variables for better trace
        for k, v in resolved_vars.items():
            val_str = str(v)
            if len(val_str) > 100:
                val_str = val_str[:100] + "..."
            self._log_debug(f"Variable Resolved: {k} = {val_str}", state)
            print(f"[RUNTIME] Variable Set: {k} = {val_str}")
        
        # We return the resolved variables as output.
        # The GenericPipelinePrimitive (and ESM) will merge this into state["variables"].
        return PrimitiveResult(success=True, output=resolved_vars)
