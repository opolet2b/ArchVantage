"""
Automation Service

Orchestrates spatial automations on the Semantic Canvas.
Matches events (hooks) to configured watchers and triggers agent blueprints.
"""
from typing import Any, Dict, List, Optional
from sqlalchemy.orm import Session
from app.models.canvas_models import Canvas
from app.services.agent_runtime import AgentRuntime
from app.models.agent_blueprint import AgentBlueprint, AgentExecution
from app.services.execution_state_machine import ExecutionStateMachine, store_state_machine


class AutomationService:
    """
    Service to handle spatial automations triggered by canvas events.
    """
    
    _event_locks: Dict[str, Any] = {} # In-memory lock registry: {(thing_id, hook): asyncio.Lock}

    def _get_lock(self, thing_id: str, hook: str) -> Any:
        """Get or create an asyncio Lock for a specific (thing, hook) pair."""
        import asyncio
        key = f"{thing_id}:{hook}"
        if key not in self._event_locks:
            self._event_locks[key] = asyncio.Lock()
        return self._event_locks[key]

    def _log(self, message: str, level: str = "INFO"):
        """Write a formatted log entry to backend/automations.log"""
        try:
            from datetime import datetime
            import os
            
            log_path = "backend/automations.log"
            timestamp = datetime.utcnow().isoformat()
            
            # Ensure backend dir exists
            if not os.path.exists("backend"):
                os.makedirs("backend")
                
            with open(log_path, "a", encoding="utf-8") as f:
                f.write(f"[{timestamp}] [{level}] {message}\n")
            
            # ALSO PRINT TO STDOUT FOR VISIBILITY
            print(f"[Automation] [{level}] {message}")
        except Exception as e:
            print(f"FAILED TO WRITE AUTOMATION LOG: {e}")

    async def handle_canvas_event(
        self, 
        db: Session, 
        canvas_id: str, 
        hook: str, 
        payload: Dict[str, Any],
        user_id: int
    ) -> List[Dict[str, Any]]:
        """
        Process a canvas event and trigger matching automations.
        """
        thing_id = payload.get("thing_id")
        if thing_id:
            async with self._get_lock(str(thing_id), hook):
                return await self._handle_canvas_event_internal(db, canvas_id, hook, payload, user_id)
        else:
            return await self._handle_canvas_event_internal(db, canvas_id, hook, payload, user_id)

    async def _handle_canvas_event_internal(
        self, 
        db: Session, 
        canvas_id: str, 
        hook: str, 
        payload: Dict[str, Any],
        user_id: int
    ) -> List[Dict[str, Any]]:
        """
        Internal implementation of event handling.
        """
        results = []
        
        # 1. Fetch Canvas and its automation config
        canvas = db.query(Canvas).filter(Canvas.id == canvas_id).first()
        if not canvas:
            self._log(f"Event Intake: Canvas {canvas_id} not found", "WARNING")
            return results
            
        # FORCE REFRESH to ensure we have the latest config
        db.refresh(canvas)
            
        if not canvas.owner_config:
            self._log(f"Event Intake: Canvas {canvas_id} has no owner_config. Keys: {dir(canvas)}", "DEBUG")
            return results
            
        self._log(f"Event Intake: owner_config keys: {list(canvas.owner_config.keys()) if canvas.owner_config else 'None'}", "DEBUG")
        self._log(f"Event Intake: scenario_id: {canvas.owner_config.get('scenario_id')}", "DEBUG")
            
        automations = canvas.owner_config.get("automations", [])
        
        # DYNAMIC INHERITANCE: Check for linked Scenario and use its latest automations if available
        scenario_id = canvas.owner_config.get("scenario_id")
        if scenario_id:
            from app.models.scenario_models import Scenario
            scenario = db.query(Scenario).filter(Scenario.id == scenario_id).first()
            if scenario and scenario.configuration:
                scenario_automations = scenario.configuration.get("automations", [])
                if scenario_automations and len(scenario_automations) > 0:
                    self._log(f"Event Intake: Using {len(scenario_automations)} dynamic automations from Scenario {scenario.name} ({scenario_id})", "DEBUG")
                    automations = scenario_automations
                else:
                    self._log(f"Event Intake: Scenario {scenario.name} has no automations, falling back to local config.", "DEBUG")
            else:
                 self._log(f"Event Intake: Linked Scenario {scenario_id} not found or empty.", "WARNING")

        if not automations:
            self._log(f"Event Intake: Canvas {canvas_id} has no automations configured (Local or Scenario)", "DEBUG")
            return results
        
        # Log loaded automations hash or details for debugging
        self._log(f"Loaded {len(automations)} automations. First rule name: {automations[0].get('name') if automations else 'None'}", "DEBUG")
            
        # Context Injection: If thing_id is present, fetch details
        if "thing_id" in payload:
            from app.models.canvas_models import CanvasThing, Domain, RAGStatus
            import asyncio
            
            thing_id = payload["thing_id"]
            thing = db.query(CanvasThing).filter(CanvasThing.id == thing_id).first()
            if thing:
                if thing.rag_status in [RAGStatus.PENDING, RAGStatus.PROCESSING]:
                    self._log(f"Context: Thing {thing_id} is currently embedding ({thing.rag_status}). Text content may be incomplete.", "DEBUG")

                payload["thing_content"] = str(thing.content)
                payload["thing_name"] = getattr(thing, "name", None) or getattr(thing, "title", None) or "Untitled"
                payload["thing_type"] = thing.type
                payload["domain_id"] = thing.domain_id
                # Also inject a 'thing' object for more direct structural access in templates
                payload["thing"] = {
                    "id": thing.id,
                    "name": payload["thing_name"],
                    "type": thing.type,
                    "domain_id": thing.domain_id,
                    "content": thing.content
                }
                self._log(f"Context: Attached thing '{payload['thing_name']}' ({thing.type}) from domain {thing.domain_id}", "DEBUG")
                
        self._log(f"Event Intake: '{hook}' on canvas {canvas_id}. Checking {len(automations)} rules.")
        
        # 2. Iterate and match
        self._log(f"--- EVENT INTAKE ---", "INFO")
        self._log(f"Hook: '{hook}' | Canvas: {canvas_id}", "INFO")
        self._log(f"Payload Keys: {list(payload.keys())}", "DEBUG")
        if "is_new_domain" in payload:
            self._log(f"is_new_domain value: {payload['is_new_domain']} ({type(payload['is_new_domain'])})", "DEBUG")
        
        for auto in automations:
            auto_id = auto.get("id", "unnamed")
            auto_name = auto.get("name") or auto.get("label") or auto_id
            trigger = auto.get("trigger", {})
            auto_hook = trigger.get("hook")
            
            # Match condition logic
            is_hook_match = (auto_hook == hook)
            
            # BRIDGE LOGIC: treat onDrop as onEntry if is_new_domain is False
            if not is_hook_match and hook == "onDrop" and auto_hook == "onEntry":
                is_new = payload.get("is_new_domain")
                if is_new is False:
                    is_hook_match = True
                    self._log(f"  [BRIDGE] Bridged onDrop -> onEntry for rule '{auto_name}'", "DEBUG")
                else:
                    self._log(f"  [BRIDGE SKIP] hook={hook}, auto_hook={auto_hook}, is_new={is_new}", "DEBUG")

            # Log every rule check
            self._log(f"  Rule '{auto_name}': Target={auto_hook}, Current={hook}, Match={is_hook_match}", "DEBUG")
            
            if not is_hook_match:
                continue
                
            # Filter logic (e.g. domain, type, zone)
            # The new logic uses 'filters' key, but the old logic used direct keys in 'trigger'.
            # To maintain compatibility with _get_match_error, we'll use the _get_match_error.
            # The provided snippet for filters seems to be a new way of handling filters.
            # I will use the existing _get_match_error for now, as the instruction implies
            # adding logs around the existing matching mechanism, not replacing the filter logic itself.
            # The instruction's new block for filters is a bit ambiguous if it replaces _get_match_error or works with it.
            # Given the instruction's final lines:
            # match_err = self._get_match_error(db, trigger, payload)
            # if match_err:
            #     self._log(f"  [FAIL] Filter mismatch: {match_err}", "DEBUG")
            #     continue
            # self._log(f"  [MATCH] Rule '{auto_name}' triggered.", "INFO")
            # This suggests _get_match_error is still used.
            
            # Filter check (e.g. domain_id matching)
            match_err = self._get_match_error(db, trigger, payload)
            if match_err:
                self._log(f"  [FAIL] Filter mismatch: {match_err}", "DEBUG")
                continue
                
            self._log(f"  [MATCH] Rule '{auto_name}' triggered.", "INFO")
                
            # 3. Trigger Action
            action = auto.get("action", {})
            blueprint_id = action.get("blueprint_id")
            action_type = action.get("type")
            
            if blueprint_id:
                self._log(f"  [ACTION] Executing Blueprint {blueprint_id} for '{auto_name}'", "INFO")
                res = await self._run_automation_blueprint(
                    db, 
                    blueprint_id, 
                    payload, 
                    user_id,
                    canvas_id
                )
                status = "SUCCESS" if res.get("success") else f"FAILED: {res.get('error')}"
                self._log(f"  [RESULT] Blueprint result: {status}", "INFO")
                
                results.append({
                    "automation_name": auto_name,
                    "status": "triggered_blueprint",
                    "blueprint_id": blueprint_id,
                    "execution_id": res.get("execution_id"),
                    "output": res.get("output"),
                    "steps": res.get("steps"),
                    "final_status": res.get("status")
                })
            elif action_type == "pipeline" or "steps" in action:
                steps = action.get("steps", [])
                self._log(f"  [ACTION] Executing dynamic pipeline ({len(steps)} steps) for '{auto_name}'", "INFO")
                if steps:
                     self._log(f"  [DEBUG] Step 0 type: {type(steps[0])}, Content: {steps[0]}", "DEBUG")
                res = await self._run_pipeline_automation(
                    db,
                    steps,
                    payload,
                    user_id,
                    canvas_id
                )
                status = "SUCCESS" if res.get("success") else f"FAILED: {res.get('error')}"
                self._log(f"  [RESULT] Pipeline result: {status}", "INFO")
                
                results.append({
                    "automation_name": auto_name,
                    "status": "triggered_pipeline",
                    "steps_count": len(steps),
                    "execution_id": res.get("execution_id"),
                    "output": res.get("output"),
                    "steps": res.get("steps"),
                    "final_status": res.get("status")
                })
        
        # Post-Automation: Update Thing Metadata if applicable
        if results and "thing_id" in payload:
            from app.models.canvas_models import CanvasThing
            from sqlalchemy.orm.attributes import flag_modified

            thing_id = payload["thing_id"]
            thing = db.query(CanvasThing).filter(CanvasThing.id == thing_id).first()
            if thing:
                content = thing.content or {}
                system_meta = content.get("system_metadata", {})
                
                insights = []
                for res in results:
                    a_name = res.get("automation_name")
                    steps = res.get("steps") or []
                    
                    # Recursively collect all reasonings
                    automation_reasoning = self._extract_all_reasonings(steps, res.get("output"))
                    
                    insight_str = f"**{a_name}**"
                    
                    # Build a detailed step-by-step log
                    if steps:
                        insight_str += "\n\n**Execution Log:**\n"
                        for i, step in enumerate(steps):
                            n_type = step.get("node_type", "Unknown")
                            n_label = step.get("node_label") or step.get("label") or n_type
                            s_status = step.get("status", "unknown")
                            s_error = step.get("error", "")
                            
                            icon = "✅" if s_status == "completed" else "❌" if s_status == "failed" else "⏳"
                            insight_str += f"- {icon} **Step {i+1}**: {n_label}"
                            if s_error:
                                insight_str += f" *(Error: {s_error})*"
                            insight_str += "\n"

                    if automation_reasoning:
                        insight_str += "\n**AI Reasoning:**\n"
                        # Join multiple reasonings with bullet points if more than one
                        if len(automation_reasoning) > 1:
                            r_text = "\n".join([f"{r}" for r in automation_reasoning])
                        else:
                            r_text = f"{automation_reasoning[0]}"
                        insight_str += r_text
                    elif not steps:
                        insight_str += "\nAutomation completed successfully."
                    
                    insights.append(insight_str)
                
                if insights:
                    from datetime import datetime
                    new_insight_text = "\n\n".join(insights)
                    timestamp = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S UTC")
                    header = f"### {timestamp}\n"
                    
                    existing_insight = system_meta.get("ai_insight", "")
                    if existing_insight:
                        # Prepend new insight with a separator
                        system_meta["ai_insight"] = f"{header}{new_insight_text}\n\n---\n\n{existing_insight}"
                    else:
                        system_meta["ai_insight"] = f"{header}{new_insight_text}"
                        
                    content["system_metadata"] = system_meta
                    thing.content = content
                    flag_modified(thing, "content")
                    db.commit()
                    self._log(f"Context: Updated persistent 'ai_insight' for thing {thing_id}", "INFO")

        return results

    def _extract_all_reasonings(self, steps: List[Dict], final_output: Optional[Dict] = None) -> List[str]:
        """
        Recursively extract all reasoning/explanation strings from execution steps and outputs.
        Prioritizes chronological order of steps and recursively follows sub_steps.
        Perform a deep search for reasoning keys and <think> tags in any string.
        """
        all_reasoning = []
        reasoning_keys = ["reasoning", "rationale", "explanation", "insight", "ai_insight", "thought", "thinking"]
        
        def deep_search_reasoning(data: Any) -> List[str]:
            found = []
            if isinstance(data, dict):
                # 1. Check for explicit reasoning keys
                for k, v in data.items():
                    if any(x in k.lower() for x in reasoning_keys) and isinstance(v, str) and v.strip():
                        if v not in found:
                            found.append(v)
                
                # 2. Recurse into nested dicts/lists
                for v in data.values():
                    found.extend(deep_search_reasoning(v))
            
            elif isinstance(data, list):
                for item in data:
                    found.extend(deep_search_reasoning(item))
            
            elif isinstance(data, str):
                # 3. Look for <think> tags even if not in a known key
                if "<think>" in data and "</think>" in data:
                    # Extract the think content
                    import re
                    matches = re.findall(r"<think>([\s\S]*?)</think>", data, re.IGNORECASE)
                    for m in matches:
                        if m.strip() and m.strip() not in found:
                            found.append(m.strip())
            
            return found

        def process_step_list(step_list: List[Dict], prefix: str = ""):
            for step in step_list:
                node_type = step.get("node_type", "")
                node_label = step.get("node_label", "")
                step_out = step.get("output_data") or {}
                
                # Deep search for reasoning in this step
                step_reasonings = deep_search_reasoning(step_out)
                
                for r in step_reasonings:
                    cond = step_out.get("condition")
                    header = f"{prefix}Step '{node_label}'" if node_label else f"{prefix}Node {node_type}"
                    # If the reasoning already contains <think>, we strip it here because 
                    # the UI handler in inspector-panel.tsx expects raw content in ai_insight 
                    # or it will double-tag it. Actually, wait.
                    # The UI expecting <think> tags is GOOD. 
                    
                    # Ensure the reasoning is wrapped in <think> if it's not already, 
                    # so the UI can style it as a thinking block.
                    formatted_r = r
                    if "<think>" not in r.lower():
                        formatted_r = f"<think>{r}</think>"
                    
                    extracted = f"{header} (Condition '{cond}'):\n{formatted_r}" if cond else f"{header}:\n{formatted_r}"
                    if extracted not in all_reasoning:
                         all_reasoning.append(extracted)
                
                # GENERIC RECURSION: Follow sub_steps if they exist
                sub_steps = step.get("sub_steps")
                if isinstance(sub_steps, list) and sub_steps:
                    process_step_list(sub_steps, prefix=f"{prefix}> ")

        # Process main steps
        if steps:
            process_step_list(steps)

        # Process final output
        if final_output and isinstance(final_output, dict):
            final_reasonings = deep_search_reasoning(final_output)
            for r in final_reasonings:
                if r not in all_reasoning:
                    # Check for duplicates from steps
                    is_duplicate = False
                    for existing in all_reasoning:
                        if r in existing:
                            is_duplicate = True
                            break
                    if not is_duplicate:
                        formatted_r = r if "<think>" in r.lower() else f"<think>{r}</think>"
                        all_reasoning.append(formatted_r)
            
            # Check nested pipeline results (Standard for GenericPipelinePrimitive)
            pipeline_results = final_output.get("pipeline_results", {})
            if isinstance(pipeline_results, dict):
                try:
                    sorted_keys = sorted(pipeline_results.keys(), key=lambda x: int(x) if x.isdigit() else x)
                except:
                    sorted_keys = pipeline_results.keys()

                for step_id in sorted_keys:
                    step_out = pipeline_results[step_id]
                    if isinstance(step_out, dict):
                         sub_results = deep_search_reasoning(step_out)
                         for r in sub_results:
                             if r not in all_reasoning:
                                 formatted_r = r if "<think>" in r.lower() else f"<think>{r}</think>"
                                 all_reasoning.append(formatted_r)

        return all_reasoning

    def _get_match_error(self, db: Session, trigger: Dict[str, Any], payload: Dict[str, Any]) -> Optional[str]:
        """
        Check if the event payload matches the trigger filters.
        Returns None on match, or an error string describing the first mismatch.
        """
        from app.models.canvas_models import Domain # Import Domain here for local scope
        
        for key, expected_val in trigger.items():
            if key in ["hook", "name", "description"]:
                continue
                
            # If the filter key exists in payload, it must match
            if key in payload:
                payload_val = payload[key]
                
                # Resolve Domain Type for "domain_id" criteria
                if key == "domain_id":
                    # If rule expects ANY domain, it always passes (even on raw canvas)
                    if expected_val == "*":
                        continue

                    # Check direct ID match first
                    if str(payload_val) == str(expected_val):
                         continue # Direct ID match, so this filter passes
                    
                    # If not direct match, check if criteria matches domain TYPE or NAME
                    # Need to fetch domain from DB to get type
                    d = db.query(Domain).filter(Domain.id == str(payload_val)).first()
                    if d and (d.type == str(expected_val) or d.name == str(expected_val)):
                        self._log(f"  [PASS] Filter 'domain_id' matched domain type/name for {d.id}", "DEBUG")
                        continue # Matched by type/name, so this filter passes
                        
                # General mismatch check for other keys or if domain_id didn't match by type/name
                if str(payload_val) != str(expected_val):
                    return f"Criteria '{key}' mismatch: expected '{expected_val}', got '{payload_val}'"
            # If the filter key is in trigger but not in payload, it's a mismatch
            elif key not in ["hook", "name", "description"]:
                return f"Criteria '{key}' missing from payload"
                
        return None

    def _matches_filters(self, trigger: Dict[str, Any], payload: Dict[str, Any]) -> bool:
        """
        Legacy wrapper.
        """
        # This method needs to be updated to accept 'db' if it's still used.
        # For now, it will likely cause an error if called directly without 'db'.
        # Assuming it's only called via handle_canvas_event which passes db.
        # If this is a public method, its signature should be updated.
        # For the purpose of this edit, we'll assume it's an internal helper
        # that will be removed or updated later, or that the context provides 'db'.
        # Given the instruction, we only modify _get_match_error.
        raise NotImplementedError("This legacy wrapper needs to be updated to accept 'db' parameter.")
        # return self._get_match_error(None, trigger, payload) is None # Placeholder if db is not available

    async def _run_pipeline_automation(
        self,
        db: Session,
        steps: List[Dict],
        event_payload: Dict[str, Any],
        user_id: int,
        canvas_id: str
    ) -> Dict[str, Any]:
        """
        Execute an ad-hoc pipeline defined by steps.
        """
        try:
            # Construct a dynamic blueprint/graph that runs EXECUTE_PIPELINE
            # The primitive EXECUTE_PIPELINE takes 'steps' as input.
            
            # We inject the event payload into the initial variables,
            # but EXECUTE_PIPELINE needs 'steps' in its params.
            # We can pass 'steps' via the inputs to the START node or direct to primitive.
            
            # Simplified Graph Definition for Runtime
            dynamic_graph = {
                "nodes": [
                    {
                        "id": "run_pipeline",
                        "type": "EXECUTE_PIPELINE",
                        "params": {
                            "steps": steps
                        }
                    }
                ],
                "start_node": "run_pipeline"
            }
            
            print(f"[AutomationService] Constructed Graph: {dynamic_graph}")
            
            # Create a mock blueprint object or dict
            blueprint_mock = {"graph": dynamic_graph}
            
            # Retrieve model from canvas config
            llm_model = None
            try:
                canvas = db.query(Canvas).filter(Canvas.id == canvas_id).first()
                if canvas and canvas.owner_config:
                    toolbar_conf = canvas.owner_config.get("toolbar_config", {})
                    llm_model = canvas.owner_config.get("llm_model") or canvas.owner_config.get("model") or toolbar_conf.get("llm_model")
                    print(f"[AutomationService] Retrieved model from canvas {canvas_id}: {llm_model}")
            except Exception as e:
                print(f"[AutomationService] Failed to retrieve/inject canvas model info: {e}")
            
            # Prepare inputs
            inputs = {
                **event_payload,
                "canvas_id": canvas_id,
                "trigger_event": event_payload
            }
            
            if llm_model:
                inputs["model"] = llm_model
                print(f"[AutomationService] Injected model context into inputs: {llm_model}")
            
            # Create execution record
            execution = AgentExecution(
                blueprint_id="dynamic_pipeline", # placeholder
                user_id=user_id,
                inputs=inputs,
                status="running"
            )
            db.add(execution)
            db.commit()
            
            # Initialize State Machine
            print(f"[AutomationService] Creating ESM with model_override={llm_model}")
            sm = ExecutionStateMachine(blueprint=blueprint_mock, db=db, mode="production", model_override=llm_model)
            store_state_machine(execution.id, sm)
            
            print(f"[AutomationService] Executing dynamic pipeline with SM...")
            context = await sm.start(inputs)
            
            # Log results
            for step in context.steps:
                self._log(f"  [PIPELINE] Step complete: {step.get('node_type')}", "INFO")
            
            # Update record
            execution.status = context.state.value
            execution.outputs = context.outputs
            execution.error_message = context.error
            execution.state = context.runtime_state
            
            from datetime import datetime
            if context.state.value in ["completed", "failed"]:
                execution.completed_at = datetime.utcnow()
            db.commit()
            
            return {
                "success": context.state.value != "failed",
                "status": context.state.value,
                "execution_id": execution.id,
                "output": context.outputs,
                "steps": context.steps,
                "error": context.error
            }
            
        except Exception as e:
            print(f"[AutomationService] Pipeline execution failed: {e}")
            return {"success": False, "error": str(e)}

    async def _run_automation_blueprint(
        self, 
        db: Session, 
        blueprint_id: str, 
        event_payload: Dict[str, Any], 
        user_id: int,
        canvas_id: str
    ) -> Dict[str, Any]:
        """
        Execute an agent blueprint as part of an automation.
        """
        try:
            blueprint = db.query(AgentBlueprint).filter(AgentBlueprint.id == blueprint_id).first()
            if not blueprint:
                return {"error": f"Blueprint {blueprint_id} not found"}
                
            # Retrieve model from canvas config
            llm_model = None
            try:
                canvas = db.query(Canvas).filter(Canvas.id == canvas_id).first()
                if canvas and canvas.owner_config:
                    toolbar_conf = canvas.owner_config.get("toolbar_config", {})
                    llm_model = canvas.owner_config.get("llm_model") or canvas.owner_config.get("model") or toolbar_conf.get("llm_model")
            except Exception as e:
                self._log(f"Failed to retrieve canvas model for automation: {e}", "WARNING")
            
            inputs = {
                **event_payload,
                "canvas_id": canvas_id,
                "trigger_event": event_payload
            }
            
            # Create execution record
            execution = AgentExecution(
                blueprint_id=blueprint_id,
                user_id=user_id,
                inputs=inputs,
                status="running"
            )
            db.add(execution)
            db.commit()
            
            # Initialize State Machine
            sm = ExecutionStateMachine(blueprint=blueprint, db=db, mode="production", model_override=llm_model)
            store_state_machine(execution.id, sm)
            
            print(f"[AutomationService] Executing Blueprint with SM...")
            context = await sm.start(inputs)
            
            # Log results
            for step in context.steps:
                self._log(f"  [BLUEPRINT] Step complete: {step.get('node_type')}", "INFO")
            
            # Update record
            execution.status = context.state.value
            execution.outputs = context.outputs
            execution.error_message = context.error
            execution.state = context.runtime_state
            
            from datetime import datetime
            if context.state.value in ["completed", "failed"]:
                execution.completed_at = datetime.utcnow()
            db.commit()
            
            return {
                "success": context.state.value != "failed",
                "status": context.state.value,
                "execution_id": execution.id,
                "output": context.outputs,
                "steps": context.steps,
                "error": context.error
            }
            
        except Exception as e:
            print(f"[AutomationService] Blueprint execution failed: {e}")
            return {"success": False, "error": str(e)}

# Global Instance
automation_service = AutomationService()
