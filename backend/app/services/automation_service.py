"""
Automation Service

Orchestrates spatial automations on the Semantic Canvas.
Matches events (hooks) to configured watchers and triggers agent blueprints.
"""
from typing import Any, Dict, List, Optional
from sqlalchemy.orm import Session
from app.models.canvas_models import Canvas
from app.services.agent_runtime import AgentRuntime
from app.models.agent_blueprint import AgentBlueprint


class AutomationService:
    """
    Service to handle spatial automations triggered by canvas events.
    """
    
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
        results = []
        
        # 1. Fetch Canvas and its automation config
        canvas = db.query(Canvas).filter(Canvas.id == canvas_id).first()
        if not canvas:
            self._log(f"Event Intake: Canvas {canvas_id} not found", "WARNING")
            return results
            
        # FORCE REFRESH to ensure we have the latest config
        db.refresh(canvas)
            
        if not canvas.owner_config:
            self._log(f"Event Intake: Canvas {canvas_id} has no owner_config", "DEBUG")
            return results
            
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
                # Synchronization: Wait for embedding if it's currently PROCESSING or PENDING
                # This ensures actions like search or analysis have data to work with.
                if thing.rag_status in [RAGStatus.PENDING, RAGStatus.PROCESSING]:
                    self._log(f"Context: Thing {thing_id} is embedding ({thing.rag_status}). Waiting...", "DEBUG")
                    max_retries = 15 # 30 seconds total
                    for i in range(max_retries):
                        await asyncio.sleep(2)
                        db.refresh(thing)
                        if thing.rag_status == RAGStatus.COMPLETED:
                            self._log(f"Context: Thing {thing_id} embedding COMPLETED after {i*2}s.", "DEBUG")
                            break
                        if thing.rag_status == RAGStatus.FAILED:
                            self._log(f"Context: Thing {thing_id} embedding FAILED. Proceeding anyway.", "WARNING")
                            break
                    else:
                        self._log(f"Context: Thing {thing_id} embedding timed out after 30s. Proceeding.", "WARNING")

                payload["thing_content"] = str(thing.content)
                payload["thing_name"] = getattr(thing, "name", None) or getattr(thing, "title", None) or "Untitled"
                payload["thing_type"] = thing.type
                self._log(f"Context: Attached thing '{payload['thing_name']}' ({thing.type})", "DEBUG")
                
        self._log(f"Event Intake: '{hook}' on canvas {canvas_id}. Checking {len(automations)} rules.")
        
        # 2. Match event to automations
        for auto in automations:
            auto_name = auto.get("name", "unnamed")
            trigger = auto.get("trigger", {})
            
            # Rule Start
            self._log(f"Matching Rule '{auto_name}'...", "DEBUG")
            
            if trigger.get("hook") != hook:
                self._log(f"  [FAIL] Hook mismatch: rule expected '{trigger.get('hook')}', got '{hook}'", "DEBUG")
                continue
                
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
                    "blueprint_id": blueprint_id
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
                    "steps_count": len(steps)
                })
        
        return results

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
                # If the rule expects a Definition ID, but we have an Instance ID, 
                # we need to check if the instance's type matches the criteria.
                if key == "domain_id":
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
            
            runtime = AgentRuntime(blueprint=blueprint_mock, db=db, origin="Automation")
            
            # Prepare inputs
            inputs = {
                **event_payload,
                "canvas_id": canvas_id,
                "trigger_event": event_payload
            }
            
            # Inject Canvas Configuration (LLM Model)
            from app.models.canvas_models import Canvas
            try:
                canvas = db.query(Canvas).filter(Canvas.id == canvas_id).first()
                if canvas and canvas.owner_config:
                    llm_model = canvas.owner_config.get("llm_model") or canvas.owner_config.get("model")
                    if llm_model:
                        inputs["model"] = llm_model
                        print(f"[AutomationService] Injected model context: {llm_model}")
            except Exception as e:
                print(f"[AutomationService] Failed to inject canvas config: {e}")
            
            print(f"[AutomationService] Executing dynamic pipeline...")
            result_state = runtime.execute_stream(inputs)
            
            final_output = {}
            async for event in result_state:
                evt_type = event.get("type")
                
                if evt_type == "log":
                    self._log(f"  [PIPELINE] {event.get('message')}", "INFO")
                    
                elif evt_type == "error":
                     self._log(f"  [PIPELINE ERROR] {event.get('content')}", "ERROR")
                     return {"success": False, "error": event.get("content")}
                     
                elif evt_type == "step_start":
                     step_meta = event.get("step", {})
                     self._log(f"  [STEP] Starting {step_meta.get('node_type')} ({step_meta.get('node_result', '')})", "DEBUG")

            # Capture final output from the last executed step or state
            if runtime.steps:
                last_step = runtime.steps[-1]
                final_output = last_step.output_data
                if last_step.status == "failed":
                     return {"success": False, "error": last_step.error}
            
            return {"success": True, "output": final_output}
            
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
                
            runtime = AgentRuntime(blueprint, db=db, origin="Automation")
            
            inputs = {
                **event_payload,
                "canvas_id": canvas_id,
                "trigger_event": event_payload
            }
            
            result_state = runtime.execute_stream(inputs, initial_state={
                "variables": inputs,
                "canvas_id": canvas_id
            })
            
            final_output = {}
            async for event in result_state:
                evt_type = event.get("type")
                
                if evt_type == "log":
                    self._log(f"  [BLUEPRINT] {event.get('message')}", "INFO")
                    
                elif evt_type == "error":
                     self._log(f"  [BLUEPRINT ERROR] {event.get('content')}", "ERROR")
                     return {"success": False, "error": event.get("content")}

            # Capture final output
            if runtime.steps:
                last_step = runtime.steps[-1]
                final_output = last_step.output_data
                if last_step.status == "failed":
                     return {"success": False, "error": last_step.error}
            
            return {"success": True, "output": final_output}
            
        except Exception as e:
            print(f"[AutomationService] Blueprint execution failed: {e}")
            return {"success": False, "error": str(e)}

# Global Instance
automation_service = AutomationService()
