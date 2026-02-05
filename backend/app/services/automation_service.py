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
        if not canvas or not canvas.owner_config:
            return results
            
        automations = canvas.owner_config.get("automations", [])
        if not automations:
            return results
            
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
                    print(f"[AutomationService] Thing {thing_id} is embedding ({thing.rag_status}). Waiting...")
                    max_retries = 15 # 30 seconds total
                    for i in range(max_retries):
                        await asyncio.sleep(2)
                        db.refresh(thing)
                        if thing.rag_status == RAGStatus.COMPLETED:
                            print(f"[AutomationService] Thing {thing_id} embedding COMPLETED after {i*2}s.")
                            break
                        if thing.rag_status == RAGStatus.FAILED:
                            print(f"[AutomationService] Thing {thing_id} embedding FAILED. Proceeding anyway.")
                            break
                    else:
                        print(f"[AutomationService] Thing {thing_id} embedding timed out after 30s. Proceeding.")

                payload["thing_content"] = str(thing.content)
                payload["thing_name"] = getattr(thing, "name", None) or getattr(thing, "title", None) or "Untitled"
                payload["thing_type"] = thing.type
                
        print(f"[AutomationService] Processing '{hook}' for canvas {canvas_id}. Found {len(automations)} potential automations.")
        
        # 2. Match event to automations
        for auto in automations:
            trigger = auto.get("trigger", {})
            if trigger.get("hook") != hook:
                continue
                
            # Filter check (e.g. domain_id matching)
            if not self._matches_filters(trigger, payload):
                continue
                
            # 3. Trigger Action
            # 3. Trigger Action
            action = auto.get("action", {})
            blueprint_id = action.get("blueprint_id")
            action_type = action.get("type")
            
            if blueprint_id:
                print(f"[AutomationService] Triggering blueprint {blueprint_id} for automation '{auto.get('name', 'unnamed')}'")
                await self._run_automation_blueprint(
                    db, 
                    blueprint_id, 
                    payload, 
                    user_id,
                    canvas_id
                )
                results.append({
                    "automation_name": auto.get("name"),
                    "status": "triggered_blueprint",
                    "blueprint_id": blueprint_id
                })
            elif action_type == "pipeline" or "steps" in action:
                print(f"[AutomationService] Triggering generic pipeline for automation '{auto.get('name', 'unnamed')}'")
                steps = action.get("steps", [])
                await self._run_pipeline_automation(
                    db,
                    steps,
                    payload,
                    user_id,
                    canvas_id
                )
                results.append({
                    "automation_name": auto.get("name"),
                    "status": "triggered_pipeline",
                    "steps_count": len(steps)
                })
        
        return results

    def _matches_filters(self, trigger: Dict[str, Any], payload: Dict[str, Any]) -> bool:
        """
        Check if the event payload matches the trigger filters.
        """
        for key, value in trigger.items():
            if key in ["hook", "name", "description"]:
                continue
                
            # If the filter key exists in payload, it must match
            if key in payload and payload[key] != value:
                return False
                
        return True

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
                "nodes": {
                    "run_pipeline": {
                        "type": "primitive",
                        "primitive": "EXECUTE_PIPELINE",
                        "inputs": {
                            "steps": steps
                        }
                    }
                },
                "start_node": "run_pipeline"
            }
            
            # Create a mock blueprint object or dict
            blueprint_mock = {"graph": dynamic_graph}
            
            runtime = AgentRuntime(blueprint=blueprint_mock, db=db)
            
            # Prepare inputs
            inputs = {
                **event_payload,
                "canvas_id": canvas_id,
                "trigger_event": event_payload
            }
            
            print(f"[AutomationService] Executing dynamic pipeline...")
            result_state = await runtime.execute_stream(inputs, initial_state={
                "variables": inputs,
                "canvas_id": canvas_id
            })
            
            final_output = {}
            async for event in result_state:
                if event.get("event") == "end":
                    final_output = event.get("output", {})
            
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
                
            # FIX: Correct instantiation
            runtime = AgentRuntime(blueprint, db=db)
            
            inputs = {
                **event_payload,
                "canvas_id": canvas_id,
                "trigger_event": event_payload
            }
            
            result_state = await runtime.execute_stream(inputs, initial_state={
                "variables": inputs,
                "canvas_id": canvas_id
            })
            
            final_output = {}
            async for event in result_state:
                if event.get("event") == "end":
                    final_output = event.get("output", {})
            
            return {"success": True, "output": final_output}
            
        except Exception as e:
            print(f"[AutomationService] Blueprint execution failed: {e}")
            return {"success": False, "error": str(e)}

# Global Instance
automation_service = AutomationService()
