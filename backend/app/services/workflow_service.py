"""
Workflow Service

Core execution engine that translates visual BPMN templates into LangGraph
StateGraphs, manages checkpoint thread execution via SqliteSaver, handles
concurrent fork/join paths, and enforces strict Lane-based RBAC during human
approvals (User Tasks).
Adheres strictly to PEP 8 standards and repository styles.
"""

import json
import re
import enum
import sqlite3
import operator
import asyncio
from uuid import uuid4
from datetime import datetime
from typing import Dict, Any, List, TypedDict, Annotated, Optional, Generator, AsyncGenerator

from langgraph.graph import StateGraph, END
from langgraph.checkpoint.sqlite import SqliteSaver

from app.core.database import SessionLocal, get_db_path
from app.models.workflow import (
    WorkflowTemplate,
    WorkflowInstance,
    WorkflowExecutionLog,
    WorkflowStatus
)
from app.models.user import User
from app.services.agent_runtime import execute_blueprint


# =============================================================================
# State Management
# =============================================================================

def merge_dicts(dict1: Dict[str, Any], dict2: Dict[str, Any]) -> Dict[str, Any]:
    """
    State reducer function to safely merge dictionaries.
    Ensures parallel execution nodes do not overwrite each other's updates.
    """
    merged = (dict1 or {}).copy()
    if dict2:
        for k, v in dict2.items():
            if isinstance(v, dict) and k in merged and isinstance(merged[k], dict):
                merged[k] = merge_dicts(merged[k], v)
            else:
                merged[k] = v
    return merged


class WorkflowState(TypedDict):
    """LangGraph state schema representing runtime variables and progress."""
    variables: Annotated[Dict[str, Any], merge_dicts]
    current_node_ids: List[str]
    status: str


# =============================================================================
# Helper Utilities
# =============================================================================

def resolve_templates(data: Any, variables: Dict[str, Any]) -> Any:
    """
    Recursively replaces string placeholders like `{{doc_id}}` in parameters
    with their corresponding values from graph state variables.
    """
    if isinstance(data, str):
        # Handle exact string match replacements
        pattern = re.compile(r"\{\{([^}]+)\}\}")
        matches = pattern.findall(data)
        if len(matches) == 1 and data.strip() == f"{{{{{matches[0]}}}}}":
            key = matches[0].strip()
            return variables.get(key, data)
        # Interpolate variables in continuous string formats
        resolved = data
        for match in matches:
            key = match.strip()
            val = variables.get(key, "")
            resolved = resolved.replace(f"{{{{{match}}}}}", str(val))
        return resolved
    elif isinstance(data, dict):
        return {k: resolve_templates(v, variables) for k, v in data.items()}
    elif isinstance(data, list):
        return [resolve_templates(item, variables) for item in data]
    return data


def get_saver() -> SqliteSaver:
    """
    Instantiates a thread-safe LangGraph checkpoint saver connected
    to the active SQLite application database.
    """
    db_path = get_db_path()
    if not db_path:
        db_path = "backend/db/sql_app.db"
    
    conn = sqlite3.connect(db_path, check_same_thread=False)
    # Enable WAL mode for enhanced read/write concurrency
    conn.execute("PRAGMA journal_mode=WAL")
    return SqliteSaver(conn)


def get_snapshot_next(snap: Any) -> List[str]:
    """Helper to safely extract 'next' from LangGraph StateSnapshots which may be dicts or objects."""
    if not snap:
        return []
    if isinstance(snap, dict):
        return snap.get("next", [])
    return getattr(snap, "next", [])


def get_node_lane_assignment(node_id: str, bpmn_json: Dict[str, Any]) -> Dict[str, Any]:
    """
    Looks up the lane grouping of a specific node to identify assigned
    roles and user IDs.
    """
    nodes = bpmn_json.get("nodes", [])
    
    # 1. Locate current node definition
    node = next((n for n in nodes if n.get("id") == node_id), None)
    if not node:
        return {}
    
    parent_id = node.get("parentId")
    if not parent_id:
        return {}
    
    # 2. Match parent ID in the main nodes list (Nested grouping)
    parent_node = next((n for n in nodes if n.get("id") == parent_id), None)
    if parent_node and parent_node.get("type") in ["lane", "swimlane", "BPMNLaneNode"]:
        data = parent_node.get("data", {})
        return {
            "id": parent_id,
            "name": data.get("label", parent_node.get("name", "")),
            "roles": data.get("roles", []),
            "users": data.get("users", [])
        }
    
    # 3. Match parent ID in the explicit lanes list
    lanes = bpmn_json.get("lanes", [])
    lane = next((l for l in lanes if l.get("id") == parent_id), None)
    if lane:
        return {
            "id": parent_id,
            "name": lane.get("name", ""),
            "roles": lane.get("roles", []),
            "users": lane.get("users", [])
        }
        
    return {}


# =============================================================================
# Workflow Execution Engine
# =============================================================================

class WorkflowService:
    """
    Translates, schedules, executes and monitors BPMN workflow templates.
    """
    
    def _create_node_runnable(self, instance_id: str, node_id: str, node_type: str, node_data: Dict[str, Any]):
        """
        Creates a custom async runnable function for a LangGraph node.
        """
        async def node_runnable(state: WorkflowState) -> Dict[str, Any]:
            print(f"[WORKFLOW-{instance_id}] Node executing: {node_id} ({node_type})")
            
            def _log_enter():
                db = SessionLocal()
                try:
                    # 1. Update active nodes on database execution instance
                    instance = db.query(WorkflowInstance).filter(
                        WorkflowInstance.id == instance_id
                    ).first()
                    if instance:
                        # Capture other parallel nodes in progress if any
                        current_nodes = set(instance.current_node_ids or [])
                        current_nodes.add(node_id)
                        instance.current_node_ids = list(current_nodes)
                        instance.status = WorkflowStatus.RUNNING
                        db.commit()
                    
                    # 2. Record entry to the execution audit timeline
                    enter_log = WorkflowExecutionLog(
                        instance_id=instance_id,
                        node_id=node_id,
                        action_type="ENTER_NODE",
                        executed_by="system",
                        result_data={"timestamp": datetime.utcnow().isoformat()}
                    )
                    db.add(enter_log)
                    db.commit()
                except Exception as e:
                    print(f"[WORKFLOW ERROR] Failed to record enter log: {e}")
                finally:
                    db.close()
                    
            await asyncio.to_thread(_log_enter)
            
            # 3. Core Task Execution
            output_vars = {}
            error_message = None
            executed_by_actor = "system"
            
            # Start Event Node
            if node_type in ["start", "startevent", "bpmnstartnode"]:
                output_vars = {"_start_completed": True}
                
            # End Event Node
            elif node_type in ["end", "endevent", "bpmnendnode"]:
                output_vars = {"_end_completed": True}
                def _log_end():
                    db = SessionLocal()
                    try:
                        instance = db.query(WorkflowInstance).filter(
                            WorkflowInstance.id == instance_id
                        ).first()
                        if instance:
                            instance.status = WorkflowStatus.COMPLETED
                            instance.current_node_ids = []
                            db.commit()
                    except Exception as e:
                        print(f"[WORKFLOW ERROR] Failed to set end event state: {e}")
                    finally:
                        db.close()
                await asyncio.to_thread(_log_end)
                    
            # Service Task (AI Agent Blueprint Integration)
            elif node_type in ["servicetask", "service_task", "agenttask", "bpmnservicenode"]:
                blueprint_id = node_data.get("blueprint_id")
                if not blueprint_id:
                    error_message = f"Missing 'blueprint_id' inside Service Task properties for '{node_id}'"
                else:
                    db = SessionLocal()
                    try:
                        # Resolve parameter strings
                        resolved_inputs = resolve_templates(
                            node_data.get("inputs", {}),
                            state.get("variables", {})
                        )
                        
                        # Handle user model overrides dynamically
                        model_override = state.get("variables", {}).get("_execution_model")
                        
                        print(f"[WORKFLOW-{instance_id}] Running blueprint '{blueprint_id}' with inputs keys: {list(resolved_inputs.keys())}")
                        result = await execute_blueprint(
                            db,
                            blueprint_id,
                            resolved_inputs,
                            model=model_override
                        )
                        
                        if result.get("status") == "failed":
                            error_message = result.get("error", "Agent execution failed.")
                        else:
                            # Map service output variables
                            output_mapping = node_data.get("output_mapping", {})
                            agent_outputs = result.get("outputs", {})
                            if output_mapping:
                                # Apply explicit state mapping if provided
                                for blueprint_key, target_var in output_mapping.items():
                                    output_vars[target_var] = agent_outputs.get(blueprint_key)
                            else:
                                # Default merge variables
                                output_vars = agent_outputs
                    except Exception as e:
                        error_message = f"Service task crashed: {str(e)}"
                    finally:
                        db.close()
            
            # User Task Node (Breakpoint Resumption Logic)
            elif node_type in ["usertask", "user_task", "humantask", "bpmnusernode"]:
                # When executed, read submitted forms merged in state variables
                submitted_data = state.get("variables", {}).get(f"_submitted_form_{node_id}")
                submitting_actor = state.get("variables", {}).get(f"_submitted_by_{node_id}", "user")
                
                if submitted_data:
                    output_vars = submitted_data
                    executed_by_actor = submitting_actor
                else:
                    error_message = "Resumed User Task execution without form response variables."
            
            # Gateways
            elif node_type in ["xorgateway", "xor_gateway", "exclusivegateway", "bpmnexclusivegateway"]:
                # Simply visual pass-through logs
                output_vars = {"_xor_reached": True}
            elif node_type in ["andgateway", "and_gateway", "parallelgateway", "bpmnparallelgateway"]:
                # Simply visual pass-through logs
                output_vars = {"_and_reached": True}
                
            # Custom default node / pass-through
            else:
                output_vars = {"_pass_through": True}
            
            # 4. Finalize Database Log Record & Node status
            def _log_exit():
                db = SessionLocal()
                try:
                    # Remove active execution node from instance
                    instance = db.query(WorkflowInstance).filter(
                        WorkflowInstance.id == instance_id
                    ).first()
                    if instance:
                        active_nodes = set(instance.current_node_ids or [])
                        if node_id in active_nodes:
                            active_nodes.remove(node_id)
                        instance.current_node_ids = list(active_nodes)
                        
                        if error_message:
                            instance.status = WorkflowStatus.FAILED
                        db.commit()
                    
                    # Write exit logs to database timeline
                    exit_log = WorkflowExecutionLog(
                        instance_id=instance_id,
                        node_id=node_id,
                        action_type="ERROR" if error_message else "EXIT_NODE",
                        executed_by=executed_by_actor,
                        result_data={
                            "output": output_vars,
                            "error": error_message
                        }
                    )
                    db.add(exit_log)
                    db.commit()
                except Exception as e:
                    print(f"[WORKFLOW ERROR] Failed to record exit/error logs: {e}")
                finally:
                    db.close()
                    
            await asyncio.to_thread(_log_exit)
                
            if error_message:
                raise ValueError(error_message)
                
            # Merge variables into target dictionary
            return {
                "variables": output_vars,
                "current_node_ids": [node_id]
            }
            
        return node_runnable

    def build_graph(self, template_bpmn: Dict[str, Any], instance_id: str) -> StateGraph:
        """
        Dynamically constructs the LangGraph execution layout from BPMN JSON metadata.
        """
        nodes = template_bpmn.get("nodes", [])
        edges = template_bpmn.get("edges", [])
        
        workflow = StateGraph(WorkflowState)
        
        # 1. Resolve and Add Task Nodes
        user_task_node_ids = []
        start_node_id = None
        
        for node in nodes:
            node_id = node.get("id")
            node_type = str(node.get("type", "")).lower()
            node_data = node.get("data", {})
            
            if not node_id:
                continue
                
            # Track Start and User Tasks specifically
            if node_type in ["start", "startevent", "bpmnstartnode"]:
                start_node_id = node_id
            elif node_type in ["usertask", "user_task", "humantask", "bpmnusernode"]:
                user_task_node_ids.append(node_id)
                
            # Visual containers/lanes themselves are ignored during sequence routing
            if node_type in ["lane", "swimlane", "BPMNLaneNode"]:
                continue
                
            # Instantiate runnable node
            runnable = self._create_node_runnable(instance_id, node_id, node_type, node_data)
            workflow.add_node(node_id, runnable)
            
        # 2. Add Connections & Edge Structures
        for edge in edges:
            source = edge.get("source")
            target = edge.get("target")
            
            # Skip edges bound to visual groupings/lanes
            if source not in workflow.nodes or target not in workflow.nodes:
                continue
                
            # Retrieve source node definition
            source_node = next((n for n in nodes if n.get("id") == source), None)
            source_type = str(source_node.get("type", "")).lower() if source_node else ""
            
            if source_type in ["xorgateway", "xor_gateway", "exclusivegateway", "bpmnexclusivegateway"]:
                # XOR sequence routing conditional paths are resolved on conditional edges
                continue
                
            workflow.add_edge(source, target)
            
        # 3. Inject Exclusive XOR Routing Conditions
        for node in nodes:
            node_id = node.get("id")
            node_type = str(node.get("type", "")).lower()
            
            if node_type in ["xorgateway", "xor_gateway", "exclusivegateway", "bpmnexclusivegateway"]:
                outgoing_flows = []
                for edge in edges:
                    if edge.get("source") == node_id:
                        target = edge.get("target")
                        if target in workflow.nodes:
                            outgoing_flows.append({
                                "target": target,
                                "condition": edge.get("condition"),
                                "sourceHandle": edge.get("sourceHandle")
                            })
                            
                if outgoing_flows:
                    # Add routing mapping function
                    def make_routing_fn(flows=outgoing_flows):
                        def route_xor(state: WorkflowState) -> str:
                            variables = state.get("variables", {})
                            default_target = END
                            
                            for flow in flows:
                                condition = flow.get("condition")
                                target = flow.get("target")
                                
                                if condition:
                                    try:
                                        # Strict safe evaluations
                                        eval_globals = {"__builtins__": {}}
                                        eval_locals = {**variables, "state": state}
                                        if eval(condition, eval_globals, eval_locals):
                                            print(f"[WORKFLOW ROUTE] Conditional match found: {condition} -> {target}")
                                            return target
                                    except Exception as err:
                                        print(f"[WORKFLOW ROUTE ERROR] Failed to evaluate condition '{condition}': {err}")
                                else:
                                    # Fallback unconditional flow
                                    default_target = target
                                    
                            print(f"[WORKFLOW ROUTE] Default target route: {default_target}")
                            return default_target
                        return route_xor
                        
                    # Map all potential target paths
                    path_map = {f["target"]: f["target"] for f in outgoing_flows}
                    path_map[END] = END
                    workflow.add_conditional_edges(node_id, make_routing_fn(), path_map)
                    
        # 4. Map Terminal Ending Sequence Node to END
        for node in nodes:
            node_id = node.get("id")
            node_type = str(node.get("type", "")).lower()
            
            if node_type in ["end", "endevent", "bpmnendnode"] and node_id in workflow.nodes:
                workflow.add_edge(node_id, END)
                
        # 5. Fallback start node check
        if not start_node_id:
            # First visual node with no incoming edges
            all_source_ids = set(workflow.nodes.keys())
            all_target_ids = set()
            for edge in edges:
                all_target_ids.add(edge.get("target"))
            diff = all_source_ids - all_target_ids
            if diff:
                start_node_id = list(diff)[0]
                
        if start_node_id:
            workflow.set_entry_point(start_node_id)
        else:
            raise ValueError("No entry point or Start Event could be parsed from BPMN topology.")
            
        return workflow

    # =============================================================================
    # Core API Endpoints Implementation
    # =============================================================================

    async def start_workflow(self, template_id: str, canvas_id: str, initial_payload: Dict[str, Any], is_debug: bool = False) -> Dict[str, Any]:
        """
        Initializes an execution instance and runs the workflow until the first breakpoint.
        """
        db = SessionLocal()
        try:
            # 1. Validate Template
            template = db.query(WorkflowTemplate).filter(WorkflowTemplate.id == template_id).first()
            if not template:
                raise ValueError("Workflow template not found")
                
            # 2. Setup Database Instance Record
            instance = WorkflowInstance(
                id=str(uuid4()),
                template_id=template_id,
                canvas_id=canvas_id,
                status=WorkflowStatus.RUNNING,
                current_node_ids=[],
                state_payload={"variables": initial_payload or {}},
                is_debug=is_debug
            )
            db.add(instance)
            
            # Record base start execution log
            log = WorkflowExecutionLog(
                instance_id=instance.id,
                node_id="system",
                action_type="START_WORKFLOW",
                executed_by="system",
                result_data={"initial_payload": initial_payload}
            )
            db.add(log)
            db.commit()
            
            instance_id = instance.id
            bpmn_json = template.bpmn_json
        finally:
            db.close()
            
        # 3. Translate visual layout and compile
        try:
            workflow = self.build_graph(bpmn_json, instance_id)
            
            # Find User Tasks to set breakpoints
            # Find tasks to set breakpoints (all nodes if debug)
            user_task_ids = []
            for node in bpmn_json.get("nodes", []):
                node_type = str(node.get("type", "")).lower()
                if is_debug:
                    # In debug mode, pause before everything except start/end/lanes
                    if node_type not in ["start", "end", "lane", "startevent", "bpmnstartnode", "endevent", "bpmnendnode"]:
                        user_task_ids.append(node.get("id"))
                else:
                    if node_type in ["usertask", "user_task", "humantask", "bpmnusernode"]:
                        user_task_ids.append(node.get("id"))
            
            # 4. Trigger asynchronous execution thread
            config = {"configurable": {"thread_id": instance_id}}
            initial_state = {
                "variables": initial_payload or {},
                "current_node_ids": [],
                "status": "RUNNING"
            }
            
            async def run_workflow_bg():
                try:
                    from langgraph.checkpoint.sqlite.aio import AsyncSqliteSaver
                    import aiosqlite
                    db_path = get_db_path() or "backend/db/sql_app.db"
                    async with aiosqlite.connect(db_path, timeout=30.0) as aio_conn:
                        await aio_conn.execute("PRAGMA journal_mode=WAL")
                        await aio_conn.execute("PRAGMA synchronous=NORMAL")
                        await aio_conn.execute("PRAGMA busy_timeout=30000")
                        
                        async_saver = AsyncSqliteSaver(aio_conn)
                        app = workflow.compile(
                            checkpointer=async_saver,
                            interrupt_before=user_task_ids
                        )
                        await app.ainvoke(initial_state, config)
                        
                        # Update DB after execution stops (either at breakpoint or end)
                        db_bg = SessionLocal()
                        try:
                            instance_upd = db_bg.query(WorkflowInstance).filter(WorkflowInstance.id == instance_id).first()
                            if instance_upd:
                                # Fetch full state snapshot via CompiledStateGraph API to read next nodes to run
                                state_snap = await app.aget_state(config)
                                snap_next = get_snapshot_next(state_snap)
                                if snap_next:
                                    instance_upd.status = WorkflowStatus.WAITING
                                    instance_upd.current_node_ids = list(snap_next)
                                elif instance_upd.status != WorkflowStatus.COMPLETED:
                                    instance_upd.status = WorkflowStatus.COMPLETED
                                    instance_upd.current_node_ids = []
                                db_bg.commit()
                        finally:
                            db_bg.close()
                except Exception as e:
                    print(f"[WORKFLOW BACKGROUND ERROR] {e}")
                    import traceback
                    traceback.print_exc()
                    db_bg = SessionLocal()
                    try:
                        instance_fail = db_bg.query(WorkflowInstance).filter(WorkflowInstance.id == instance_id).first()
                        if instance_fail:
                            instance_fail.status = WorkflowStatus.FAILED
                            db_bg.commit()
                        
                        log = WorkflowExecutionLog(
                            instance_id=instance_id,
                            node_id="system",
                            action_type="ERROR",
                            executed_by="system",
                            result_data={"error": str(e), "traceback": traceback.format_exc()}
                        )
                        db_bg.add(log)
                        db_bg.commit()
                    finally:
                        db_bg.close()
            
            # Run LangGraph graph in background loop
            loop = asyncio.get_event_loop()
            loop.create_task(run_workflow_bg())
            
            # Return active metadata response
            return {
                "id": instance_id,
                "status": "RUNNING",
                "current_node_ids": []
            }
            
        except Exception as e:
            # Mark instance as failed on startup crashes
            db = SessionLocal()
            try:
                instance = db.query(WorkflowInstance).filter(WorkflowInstance.id == instance_id).first()
                if instance:
                    instance.status = WorkflowStatus.FAILED
                    db.commit()
                    
                error_log = WorkflowExecutionLog(
                    instance_id=instance_id,
                    node_id="system",
                    action_type="ERROR",
                    executed_by="system",
                    result_data={"error": f"Startup crash: {str(e)}"}
                )
                db.add(error_log)
                db.commit()
            except Exception as dberr:
                print(f"[WORKFLOW ERROR] Failed to record error logs: {dberr}")
            finally:
                db.close()
            raise e

    async def resume_workflow(
        self,
        instance_id: str,
        user: User,
        form_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Validates role constraints and resumes a paused workflow execution.

        The next-node is determined first from the LangGraph checkpoint (compiled
        app .get_state) and falls back to instance.current_node_ids when the
        compiled snapshot returns no pending nodes (e.g. transient DB locking).
        """
        db = SessionLocal()
        try:
            # 1. Fetch active instance and template from DB
            instance = db.query(WorkflowInstance).filter(
                WorkflowInstance.id == instance_id
            ).first()
            if not instance:
                raise ValueError("Workflow instance not found")

            if instance.status != WorkflowStatus.WAITING:
                raise ValueError(
                    "Workflow instance is not currently waiting for input."
                )

            template = db.query(WorkflowTemplate).filter(
                WorkflowTemplate.id == instance.template_id
            ).first()
            if not template:
                raise ValueError("Workflow template blueprint not found")

            bpmn_json = template.bpmn_json
            config = {"configurable": {"thread_id": instance_id}}

            # 2. Determine the next waiting node.
            #    Primary: inspect the LangGraph compiled-graph state snapshot.
            #    Fallback: use instance.current_node_ids stored by the background
            #    runner (reliable because the DB is updated atomically).
            next_node_id = None
            try:
                saver = get_saver()
                user_task_ids_temp = []
                for node in bpmn_json.get("nodes", []):
                    node_type = str(node.get("type", "")).lower()
                    if instance.is_debug:
                        if node_type not in [
                            "start", "end", "lane", "startevent",
                            "bpmnstartnode", "endevent", "bpmnendnode"
                        ]:
                            user_task_ids_temp.append(node.get("id"))
                    else:
                        if node_type in [
                            "usertask", "user_task", "humantask", "bpmnusernode"
                        ]:
                            user_task_ids_temp.append(node.get("id"))

                workflow_temp = self.build_graph(bpmn_json, instance_id)
                app_temp = workflow_temp.compile(
                    checkpointer=saver,
                    interrupt_before=user_task_ids_temp
                )
                state_snapshot = app_temp.get_state(config)
                snap_next = get_snapshot_next(state_snapshot)
                if snap_next:
                    next_node_id = snap_next[0]
            except Exception as snap_err:
                print(
                    f"[WORKFLOW RESUME] Snapshot lookup failed, "
                    f"falling back to DB node ids: {snap_err}"
                )

            # Fallback: trust the DB record set by the background runner
            if not next_node_id and instance.current_node_ids:
                next_node_id = instance.current_node_ids[0]
                print(
                    f"[WORKFLOW RESUME] Using DB fallback next_node_id: {next_node_id}"
                )

            if not next_node_id:
                raise ValueError("Workflow is not waiting on any breakpoints.")
            
            # 2. Strict Lane RBAC Authorization check
            lane_info = get_node_lane_assignment(next_node_id, bpmn_json)
            if lane_info:
                lane_roles = lane_info.get("roles", [])
                lane_users = lane_info.get("users", [])
                
                # If restrictions exist, enforce verification
                if lane_roles or lane_users:
                    authorized = False
                    
                    # Validate by user email
                    if user.email in lane_users:
                        authorized = True
                    else:
                        # Validate by roles assigned to user
                        user_roles = [role.name for role in user.roles]
                        for role in lane_roles:
                            if role in user_roles:
                                authorized = True
                                break
                                
                    if not authorized:
                        raise HTTPException(
                            status_code=403,
                            detail=f"Access Denied: Task '{next_node_id}' is restricted to members of '{lane_info.get('name')}' lane."
                        )
            
            # Record manual validation logs
            log = WorkflowExecutionLog(
                instance_id=instance_id,
                node_id=next_node_id,
                action_type="RESUME_NODE",
                executed_by=user.email,
                result_data={"submitted_form": form_data}
            )
            db.add(log)
            db.commit()
            
            instance.status = WorkflowStatus.RUNNING
            db.commit()
            
            is_debug = instance.is_debug
        finally:
            db.close()
            
        # 3. Inject inputs into checkpoint state variables
        variables_update = {
            f"_submitted_form_{next_node_id}": form_data,
            f"_submitted_by_{next_node_id}": user.email
        }
        
        # Create updates update state dict
        new_state = {
            "variables": variables_update,
            "status": "RUNNING"
        }
        
        # Build and compile graph
        workflow = self.build_graph(bpmn_json, instance_id)
        user_task_ids = []
        for node in bpmn_json.get("nodes", []):
            node_type = str(node.get("type", "")).lower()
            if is_debug:
                # In debug mode, pause before everything except start/end/lanes
                if node_type not in ["start", "end", "lane", "startevent", "bpmnstartnode", "endevent", "bpmnendnode"]:
                    user_task_ids.append(node.get("id"))
            else:
                if node_type in ["usertask", "user_task", "humantask", "bpmnusernode"]:
                    user_task_ids.append(node.get("id"))
                
        # Resume thread execution using background task
        async def run_workflow_bg():
            try:
                from langgraph.checkpoint.sqlite.aio import AsyncSqliteSaver
                import aiosqlite
                db_path = get_db_path() or "backend/db/sql_app.db"
                async with aiosqlite.connect(db_path, timeout=30.0) as aio_conn:
                    await aio_conn.execute("PRAGMA journal_mode=WAL")
                    await aio_conn.execute("PRAGMA synchronous=NORMAL")
                    await aio_conn.execute("PRAGMA busy_timeout=30000")
                    
                    async_saver = AsyncSqliteSaver(aio_conn)
                    # Compile graph using async saver first
                    app = workflow.compile(
                        checkpointer=async_saver,
                        interrupt_before=user_task_ids
                    )
                    # Update state asynchronously on the compiled app graph
                    # Use as_node to treat this update as the node's output and bypass the interrupt
                    await app.aupdate_state(config, new_state, as_node=next_node_id)
                    
                    await app.ainvoke(None, config)
                    
                    # Update DB after execution stops
                    db_bg = SessionLocal()
                    try:
                        instance_upd = db_bg.query(WorkflowInstance).filter(WorkflowInstance.id == instance_id).first()
                        if instance_upd:
                            # Fetch state snapshot from compiled app to get proper next node keys
                            state_snap = await app.aget_state(config)
                            snap_next = get_snapshot_next(state_snap)
                            if snap_next:
                                instance_upd.status = WorkflowStatus.WAITING
                                instance_upd.current_node_ids = list(snap_next)
                            elif instance_upd.status != WorkflowStatus.COMPLETED:
                                instance_upd.status = WorkflowStatus.COMPLETED
                                instance_upd.current_node_ids = []
                            db_bg.commit()
                    finally:
                        db_bg.close()
            except Exception as e:
                print(f"[WORKFLOW BACKGROUND ERROR] {e}")
                import traceback
                traceback.print_exc()
                db_bg = SessionLocal()
                try:
                    instance_fail = db_bg.query(WorkflowInstance).filter(WorkflowInstance.id == instance_id).first()
                    if instance_fail:
                        instance_fail.status = WorkflowStatus.FAILED
                        db_bg.commit()
                    
                    log = WorkflowExecutionLog(
                        instance_id=instance_id,
                        node_id="system",
                        action_type="ERROR",
                        executed_by="system",
                        result_data={"error": str(e), "traceback": traceback.format_exc()}
                    )
                    db_bg.add(log)
                    db_bg.commit()
                finally:
                    db_bg.close()

        loop = asyncio.get_event_loop()
        loop.create_task(run_workflow_bg())
        
        return {
            "id": instance_id,
            "status": "RUNNING"
        }

    async def abort_workflow(self, instance_id: str) -> Dict[str, Any]:
        """
        Prematurely aborts a workflow instance.
        """
        db = SessionLocal()
        try:
            instance = db.query(WorkflowInstance).filter(WorkflowInstance.id == instance_id).first()
            if not instance:
                raise ValueError("Workflow instance not found")
                
            instance.status = WorkflowStatus.FAILED
            instance.current_node_ids = []
            
            log = WorkflowExecutionLog(
                instance_id=instance_id,
                node_id="system",
                action_type="ABORT_WORKFLOW",
                executed_by="system",
                result_data={"message": "Workflow execution aborted by user."}
            )
            db.add(log)
            db.commit()
            
            return {
                "id": instance_id,
                "status": "FAILED",
                "message": "Workflow successfully terminated."
            }
        finally:
            db.close()

    async def stream_workflow_execution(
        self,
        instance_id: str,
        request=None
    ) -> AsyncGenerator[str, None]:
        """
        Pushes real-time execution changes, current breakpoints, and logs
        as NDJSON data stream to the Canvas subscriber.

        Important: waiting-node resolution is derived entirely from the instance
        DB record (status + current_node_ids) rather than the LangGraph
        checkpoint saver.  saver.get() returns a CheckpointTuple namedtuple
        that carries no .next attribute, so the old get_snapshot_next() call
        always returned [] and gui_schema was never sent to the client.
        """
        last_log_id = 0
        execution_active = True

        print(f"[WORKFLOW STREAM] Started subscription for instance: {instance_id}")

        while execution_active:
            if request and await request.is_disconnected():
                print(f"[WORKFLOW STREAM] Client disconnected for instance: {instance_id}")
                break

            print(f"[DEBUG] Loop start for {instance_id}")
            db = SessionLocal()
            try:
                print(f"[DEBUG] Fetching instance {instance_id}")
                # 1. Fetch active instance state from DB
                instance = db.query(WorkflowInstance).filter(
                    WorkflowInstance.id == instance_id
                ).first()
                print(f"[DEBUG] Fetched instance {instance_id}: {instance}")
                if not instance:
                    yield (
                        f'data: {{"type": "error", "message": '
                        f'"Workflow instance \'{instance_id}\' not found"}}\n\n'
                    )
                    break

                # 2. Pull incremental execution logs
                logs = db.query(WorkflowExecutionLog).filter(
                    WorkflowExecutionLog.instance_id == instance_id,
                    WorkflowExecutionLog.id > last_log_id
                ).order_by(WorkflowExecutionLog.id.asc()).all()

                for log in logs:
                    log_payload = {
                        "type": "log",
                        "log": {
                            "id": log.id,
                            "node_id": log.node_id,
                            "action_type": log.action_type,
                            "executed_by": log.executed_by or "",
                            "timestamp": log.timestamp.isoformat(),
                            "result_data": log.result_data or {}
                        }
                    }
                    yield f"data: {json.dumps(log_payload)}\n\n"
                    last_log_id = log.id

                # 3. Resolve waiting-node details using instance DB state.
                #    We intentionally avoid saver.get() here because it returns
                #    a CheckpointTuple whose .next attribute is always missing,
                #    causing gui_schema to never be populated.
                waiting_node = None
                gui_schema = None
                lane_authorization = {}

                status_val = instance.status
                if hasattr(status_val, "value"):
                    status_val = status_val.value
                elif isinstance(status_val, enum.Enum):
                    status_val = status_val.name

                if (
                    status_val == "WAITING"
                    and instance.current_node_ids
                ):
                    waiting_node = instance.current_node_ids[0]

                    # Resolve form schema from template topology
                    template = db.query(WorkflowTemplate).filter(
                        WorkflowTemplate.id == instance.template_id
                    ).first()
                    if template:
                        nodes = template.bpmn_json.get("nodes", [])
                        node = next(
                            (n for n in nodes if n.get("id") == waiting_node),
                            None
                        )
                        if node:
                            node_data = node.get("data", {})

                            # Primary: dynamically load from GUI tool if linked
                            form_tool_id = node_data.get("form_tool_id")
                            if form_tool_id:
                                try:
                                    from app.models.tools import Tool
                                    tool = db.query(Tool).filter(
                                        Tool.id == int(form_tool_id)
                                    ).first()
                                    if tool:
                                        gui_schema = tool.configuration
                                        if isinstance(gui_schema, str):
                                            try:
                                                gui_schema = json.loads(gui_schema)
                                            except Exception as json_err:
                                                print(
                                                    f"[WORKFLOW STREAM ERROR] "
                                                    f"Failed to parse tool config "
                                                    f"JSON string: {json_err}"
                                                )
                                except Exception as tool_err:
                                    print(
                                        f"[WORKFLOW STREAM ERROR] Failed to fetch"
                                        f" dynamic form tool {form_tool_id}: {tool_err}"
                                    )

                            # Secondary: fall back to inline gui_schema on node
                            if not gui_schema:
                                raw = node_data.get("gui_schema")
                                if isinstance(raw, str):
                                    try:
                                        raw = json.loads(raw)
                                    except Exception:
                                        raw = None
                                gui_schema = raw

                            # Tertiary: default approval form
                            if not gui_schema:
                                gui_schema = {
                                    "type": "object",
                                    "title": node_data.get(
                                        "label", "Human Approval Required"
                                    ),
                                    "properties": {
                                        "approved": {
                                            "type": "boolean",
                                            "title": "Approve Progression"
                                        },
                                        "comments": {
                                            "type": "string",
                                            "title": "Review Comments"
                                        }
                                    }
                                }

                            # Lane restrictions metadata
                            lane_info = get_node_lane_assignment(
                                waiting_node, template.bpmn_json
                            )
                            if lane_info:
                                lane_authorization = {
                                    "lane_name": lane_info.get("name"),
                                    "roles": lane_info.get("roles", []),
                                    "users": lane_info.get("users", [])
                                }

                # 4. Push active status frame to client
                payload = {
                    "type": "status",
                    "status": status_val,
                    "current_node_ids": instance.current_node_ids or [],
                    "waiting_node": waiting_node,
                    "gui_schema": gui_schema,
                    "lane_authorization": lane_authorization,
                    "variables": (
                        instance.state_payload.get("variables", {})
                        if instance.state_payload else {}
                    )
                }
                print(f"[DEBUG STREAM] Yielding status for {instance_id}: {status_val}")
                yield f"data: {json.dumps(payload)}\n\n"

                # 5. Terminate stream when execution finishes
                if status_val in ["COMPLETED", "FAILED"]:
                    execution_active = False

            except Exception as e:
                print(f"[WORKFLOW STREAM ERROR] subscription failed: {e}")
                import traceback
                traceback.print_exc()
                error_payload = {"type": "error", "message": str(e)}
                yield f"data: {json.dumps(error_payload)}\n\n"
                break
            finally:
                db.close()

            if execution_active:
                await asyncio.sleep(1.0)

        print(f"[WORKFLOW STREAM] Ended subscription for instance: {instance_id}")


workflow_service = WorkflowService()
