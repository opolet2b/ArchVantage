"""
Agent Runtime

Dynamic LangGraph execution engine that builds and runs workflows
from JSON Blueprint definitions.
"""
from typing import Any, Dict, List, Optional, TypedDict
from datetime import datetime
import uuid

# LangGraph imports - will be installed via requirements
try:
    from langgraph.graph import StateGraph, END
except ImportError:
    # Fallback for when langgraph is not installed
    StateGraph = None
    END = "END"

from app.services.agent_primitives import get_primitive, PRIMITIVE_REGISTRY
from app.services.agent_primitives.base import PrimitiveResult
from app.services.agent_secret_manager import secret_manager
from app.services.dry_run import SchemaDiscoveryService
from app.models.smart_template import SmartOutputFormat, SmartTemplatePersona, SmartTemplateFramework


class AgentState(TypedDict):
    """State passed between nodes during agent execution."""
    inputs: Dict[str, Any]         # Initial input values
    variables: Dict[str, Any]      # Working variables
    secrets: Dict[str, str]        # Decrypted secrets
    history: List[Dict]            # Execution history
    current_node: Optional[str]    # Current node ID
    current_output: Any            # Output from last node
    error: Optional[str]           # Error message if failed
    db: Any                        # Database session


class ExecutionStep:
    """Record of a single step in the execution."""
    def __init__(self, node_id: str, node_type: str, node_label: str = ""):
        self.node_id = node_id
        self.node_type = node_type
        self.node_label = node_label  # Human-readable name for display
        self.started_at = datetime.utcnow()
        self.completed_at = None
        self.input_data = {}
        self.output_data = {}
        self.status = "running"
        self.error = None
    
    def complete(self, output: Any, error: Optional[str] = None):
        self.completed_at = datetime.utcnow()
        self.output_data = output if isinstance(output, dict) else {"result": output}
        self.status = "failed" if error else "completed"
        self.error = error
    
    def to_dict(self) -> Dict:
        return {
            "node_id": self.node_id,
            "node_type": self.node_type,
            "node_label": self.node_label,
            "status": self.status,
            "started_at": self.started_at.isoformat(),
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
            "duration_ms": int((self.completed_at - self.started_at).total_seconds() * 1000) 
                          if self.completed_at else None,
            "input_data": self.input_data,
            "output_data": self.output_data,
            "captured_schema": getattr(self, 'captured_schema', None),
            "error": self.error
        }


class AgentRuntime:
    """
    Runtime engine for executing Agent Blueprints.
    
    Dynamically constructs LangGraph workflows from JSON blueprints
    and manages execution state.
    """
    
    def __init__(self, blueprint, db=None):
        """
        Initialize the runtime with a blueprint.
        
        Args:
            blueprint: BlueprintResponse or dict containing the blueprint
            db: Optional database session
        """
        self.blueprint = blueprint
        self.db = db
        self.steps: List[ExecutionStep] = []
        self._graph = None
        
        # Parse graph structure
        if hasattr(blueprint, 'graph'):
            self.graph_def = blueprint.graph
        elif isinstance(blueprint, dict):
            self.graph_def = blueprint.get('graph', {})
        else:
            self.graph_def = {"nodes": [], "edges": []}
        
        # Build node/edge maps
        self.nodes = {}
        self.edges = {}
        self._build_graph_maps()
    
    def _build_graph_maps(self):
        """Build maps for quick node/edge lookup."""
        # Handle both Pydantic models and dicts
        nodes = self.graph_def.nodes if hasattr(self.graph_def, 'nodes') else self.graph_def.get('nodes', [])
        
        # Check if we have linear 'steps' instead of nodes (Studio format)
        steps = self.graph_def.steps if hasattr(self.graph_def, 'steps') else self.graph_def.get('steps', [])
        
        edges = []
        
        # Debug Logging to File
        try:
            with open("execution_debug.log", "a", encoding="utf-8") as f:
                ts = datetime.utcnow().isoformat()
                n_count = len(nodes) if nodes else 0
                s_count = len(steps) if steps else 0
                f.write(f"\n[{ts}] [RUNTIME INIT] Nodes: {n_count}, Steps: {s_count}\n")
                if n_count > 0:
                    f.write(f"[{ts}] [RUNTIME INIT] First Node Params: {nodes[0].get('params')}\n")
        except Exception: pass

        # Check if we need to rebuild from steps
        # Trigger if: 
        # 1. No nodes
        # 2. Nodes exist but seem unconfigured (no params) while steps are available
        should_rebuild = False
        if not nodes:
            should_rebuild = True
        elif steps and len(nodes) > 0 and not nodes[0].get("params"):
             # Only rebuild if params are truly empty/None
             should_rebuild = True
             try:
                 with open("execution_debug.log", "a") as f: f.write(f"[{datetime.utcnow().isoformat()}] [RUNTIME] FORCE REBUILD: Nodes lack params.\n")
             except: pass

        if should_rebuild and steps:
            try:
                with open("execution_debug.log", "a") as f: f.write(f"[{datetime.utcnow().isoformat()}] [RUNTIME] Converting steps to graph...\n")
            except: pass
            print("[RUNTIME] Detected linear 'steps' format. Converting to graph.")
            nodes = []
            
            for i, step in enumerate(steps):
                # Ensure each step has an ID
                step_id = step.get('id') or f"step_{i}"
                if 'id' not in step: step['id'] = step_id

                # Map Studio 'config' to Primitive 'params'
                if 'config' in step:
                    config = step.get('config', {})
                    params = step.get('params', {})
                    
                    # Merge config into params, allowing params to override config
                    merged_params = {**config, **params}
                    
                    step_type = step.get('type', '').lower()
                    print(f"[RUNTIME DEBUG] Processing step: {step_type}, Config Instructions: {config.get('additionalInstructions')}, Params Instructions: {params.get('instruction')}")
                    
                    if "agent" in step_type:
                        if "objective" in merged_params:
                             merged_params["instruction"] = merged_params.pop("objective")
                        if "reasoningDepth" in merged_params:
                             merged_params["reasoning_depth"] = merged_params.pop("reasoningDepth")
                        if "personaId" in merged_params and self.db:
                             pid = merged_params.pop("personaId")
                             p = self.db.query(SmartTemplatePersona).filter(SmartTemplatePersona.id == pid).first()
                             if p:
                                 merged_params["persona"] = p.role
                        if "frameworkId" in merged_params and self.db:
                             fid = merged_params.pop("frameworkId")
                             if fid != "none":
                                 f = self.db.query(SmartTemplateFramework).filter(SmartTemplateFramework.id == fid).first()
                                 if f:
                                     merged_params["framework"] = f.name
                            
                    elif "extractor" in step_type:
                        # Combine fields into a single instruction
                        instructions_parts = []
                        if "sourceSections" in merged_params:
                            instructions_parts.append(f"Source Sections: {merged_params.pop('sourceSections')}")
                        if "focus" in merged_params:
                            instructions_parts.append(f"Focus: {merged_params.pop('focus')}")
                        if "exclude" in merged_params:
                            instructions_parts.append(f"Exclude: {merged_params.pop('exclude')}")
                        if "additionalInstructions" in merged_params:
                            instructions_parts.append(f"Instructions: {merged_params.pop('additionalInstructions')}")
                        
                        if instructions_parts:
                            merged_params["instruction"] = "\n".join(instructions_parts)

                    elif "visualizer" in step_type:
                        # Ensure specific visualizer fields are passed (renderingType is usually enough)
                        pass

                    step['params'] = merged_params
                
                # Handle Formatter Steps - Convert to DOCUMENT_CONVERTER
                step_type_raw = step.get('type', '').lower()
                if step_type_raw == "formatter":
                    step['type'] = "DOCUMENT_CONVERTER"
                    
                    selected_params = step['params']
                    
                    # Resolve Format ID to Extension using DB
                    # Prioritize new unified 'outputFormatId'
                    fmt_id = config.get("outputFormatId") or config.get("textFormatId") or config.get("graphicsFormatId") or config.get("dataFormatId")
                    
                    if fmt_id and self.db:
                        fmt = self.db.query(SmartOutputFormat).filter(SmartOutputFormat.id == fmt_id).first()
                        if fmt:
                            selected_params["output_format"] = fmt.extension.lower()
                    
                    if not selected_params.get("output_format"):
                         selected_params["output_format"] = "markdown" # Default fallback
                         
                    # Auto-link input content from previous node if available
                    if len(nodes) > 0:
                        prev_id = nodes[-1].get('id')
                        # We bind to _raw which is always present in TextTemplatePrimitive output
                        # Use vars['key'] syntax to handle UUIDs with dashes safely
                        selected_params["input_content"] = f"{{{{ variables['{prev_id}']['_raw'] }}}}"
                        # Fallback binding if visual_payload doesn't exist? 
                        # Template resolver might need multiple attempts, but let's stick to strict contract.

                # Remove legacy merging logic
                # if step_type_raw == "formatter" and len(nodes) > 0: ... (DELETED)

                nodes.append(step)
                
                # Create sequential edge
                if i > 0:
                    prev_id = steps[i-1].get('id')
                    edges.append({
                        "source": prev_id,
                        "target": step_id,
                        "type": "default",
                        "id": f"edge_{prev_id}_{step_id}"
                    })
        else:
            edges = self.graph_def.edges if hasattr(self.graph_def, 'edges') else self.graph_def.get('edges', [])
        
        for node in nodes:
            node_id = node.id if hasattr(node, 'id') else node.get('id')
            self.nodes[node_id] = node
        
        for edge in edges:
            source = edge.source if hasattr(edge, 'source') else edge.get('source')
            if source not in self.edges:
                self.edges[source] = []
            self.edges[source].append(edge)
    
    def _get_start_node(self) -> Optional[str]:
        """
        Find the starting node.
        
        First looks for a node with type=START, then falls back to
        topology-based detection (node with no incoming edges).
        """
        # First, look for an explicit START node by type
        for node_id, node in self.nodes.items():
            node_type = node.type if hasattr(node, 'type') else node.get('type')
            # Handle enum values
            # Handle enum values
            if hasattr(node_type, 'value'):
                node_type = node_type.value
            
            # Case-insensitive check
            if node_type and str(node_type).upper() == "START":
                print(f"[RUNTIME] Found START node by type: {node_id}")
                return node_id
        
        # Fallback: find node with no incoming edges
        all_nodes = set(self.nodes.keys())
        nodes_with_incoming = set()
        
        for edges in self.edges.values():
            for edge in edges:
                target = edge.target if hasattr(edge, 'target') else edge.get('target')
                nodes_with_incoming.add(target)
        
        start_nodes = all_nodes - nodes_with_incoming
        if start_nodes:
            start_node = next(iter(start_nodes))
            print(f"[RUNTIME] Found start node by topology: {start_node}")
            return start_node
        
        return None
    
    def _get_next_node(self, current_node: str, result: PrimitiveResult) -> Optional[str]:
        """Determine the next node based on edges and result."""
        # If primitive returned specific next node (for branching)
        if result.next_node:
            return result.next_node
        
        # Follow edges from current node
        edges = self.edges.get(current_node, [])
        
        if not edges:
            return None  # End of workflow
        
        # Check conditional edges
        for edge in edges:
            condition = edge.condition if hasattr(edge, 'condition') else edge.get('condition')
            if condition:
                # TODO: Evaluate condition
                pass
            else:
                # Unconditional edge
                return edge.target if hasattr(edge, 'target') else edge.get('target')
        
        return None
    
    async def _execute_node(self, node_id: str, state: AgentState) -> PrimitiveResult:
        """Execute a single node."""
        node = self.nodes.get(node_id)
        if not node:
            return PrimitiveResult(success=False, error=f"Node not found: {node_id}")
        
        # Get node type and params
        node_type = node.type if hasattr(node, 'type') else node.get('type')
        params = node.params if hasattr(node, 'params') else node.get('params', {})
        
        # Get node label from metadata for display
        metadata = node.metadata if hasattr(node, 'metadata') else node.get('metadata', {})
        if hasattr(metadata, 'label'):
            node_label = metadata.label
        else:
            node_label = metadata.get('label', '') if isinstance(metadata, dict) else ''
        
        # Handle enum values
        if hasattr(node_type, 'value'):
            node_type = node_type.value
            
        # Normalize to uppercase for lookup
        if node_type:
            node_type = str(node_type).upper()
        
        # Get primitive instance
        try:
            primitive = get_primitive(node_type)
        except ValueError as e:
            return PrimitiveResult(success=False, error=str(e))
        
        # Create execution step with label for display
        step = ExecutionStep(node_id, node_type, node_label)
        step.input_data = {"params": params, "variables": state.get("variables", {})}
        self.steps.append(step)
        
        # Execute primitive
        try:
            result = await primitive.execute(params, state)
            
            # Capture schema if successful
            if result.success:
                try:
                    step.captured_schema = SchemaDiscoveryService.infer_schema_from_data(result.output)
                except Exception as e:
                    print(f"[RUNTIME WARNING] Failed to infer schema for node {node_id}: {e}")

            step.complete(result.output, result.error if not result.success else None)
            return result
        except Exception as e:
            error_msg = str(e)
            step.complete({}, error_msg)
            return PrimitiveResult(success=False, error=error_msg)
    
    async def execute_stream(self, inputs: Dict[str, Any], initial_state: Optional[Dict[str, Any]] = None, steps_limit: Optional[int] = None):
        """
        Execute the agent workflow as a stream of events.
        
        Yields:
            Dict: execution events
        """
        started_at = datetime.utcnow()
        
        # Initialize or Resume state
        if initial_state:
            state = initial_state
            state["db"] = self.db
            if "inputs" not in state: state["inputs"] = inputs
            current_node = state.get("current_node")
        else:
            state = {
                "inputs": inputs,
                "variables": dict(inputs),
                "secrets": {},
                "history": [],
                "current_node": None,
                "current_output": None,
                "error": None,
                "db": self.db
            }
            current_node = self._get_start_node()

        if not current_node:
            yield {
                "type": "error",
                "content": "No starting node found"
            }
            return

        # Load secrets
        if not initial_state:
            blueprint_id = getattr(self.blueprint, 'id', None) or (
                self.blueprint.get('id') if isinstance(self.blueprint, dict) else None
            )
            if blueprint_id and self.db:
                state["secrets"] = secret_manager.load_blueprint_secrets(
                    self.db, blueprint_id
                )
            
        # Yield Start Event
        state_for_event = state.copy()
        if "db" in state_for_event:
            del state_for_event["db"]
            
        yield {
            "type": "start",
            "state": state_for_event
        }
            
        max_iterations = 100
        iteration = 0
        steps_run = 0

        while current_node and iteration < max_iterations:
            iteration += 1
            steps_run += 1
            state["current_node"] = current_node
            
            # --- LOGGING HELPER ---
            def _log_execution(title, data):
                try:
                    with open("execution_debug.log", "a", encoding="utf-8") as f:
                        f.write(f"\n[{datetime.utcnow().isoformat()}] == {title} ==\n")
                        f.write(f"{str(data)}\n")
                        f.write("="*50 + "\n")
                except Exception as e:
                    print(f"Logging failed: {e}")

            # --- START EXECUTE STREAM CHANGE ---
            # Yield Step Start
            yield {
                "type": "step_start",
                "step": {
                    "node_id": current_node,
                    "node_type": self.nodes.get(current_node, {}).get("type", "UNKNOWN"),
                    "node_label": self.nodes.get(current_node, {}).get("metadata", {}).get("label", ""),
                    "started_at": datetime.utcnow().isoformat()
                }
            }
            # --- END EXECUTE STREAM CHANGE ---

            # Log Node Start
            _log_execution(f"NODE START: {current_node}", {
                "params": self.nodes.get(current_node, {}).get("params"),
                "state_variables_keys": list(state.get("variables", {}).keys())
            })

            # Execute node
            result = await self._execute_node(current_node, state)
            
            # Log Node Result
            _log_execution(f"NODE END: {current_node}", {
                "success": result.success,
                "output_preview": str(result.output)[:500] if result.success else None,
                "error": result.error
            })
            
            # Update state with output
            if result.success and result.output is not None:
                state["variables"][current_node] = result.output
                if isinstance(result.output, dict):
                    for key, value in result.output.items():
                        if not key.startswith('_'):
                            state["variables"][key] = value
                state["current_output"] = result.output
            
            state["history"].append({
                "node": current_node,
                "success": result.success,
                "output": result.output,
                "error": result.error
            })

            # --- START EXECUTE STREAM CHANGE ---
            # Yield Step Complete
            current_step = self.steps[-1] # The last step added by _execute_node
            yield {
                "type": "step_complete",
                "step": current_step.to_dict()
            }
            # --- END EXECUTE STREAM CHANGE ---
            
            if not result.success:
                state["error"] = result.error
                yield {
                    "type": "error",
                    "content": result.error
                }
                break
            
            # Check for GUI input required
            if (isinstance(result.output, dict) and 
                result.output.get("type") == "gui_input_required"):
                state_to_save = state.copy()
                if "db" in state_to_save: del state_to_save["db"]
                completed_at = datetime.utcnow()
                
                yield {
                    "type": "waiting_for_input",
                    "data": {
                        "status": "waiting_for_input",
                        "waiting_node": current_node,
                        "gui_schema": result.output.get("gui_schema", {}),
                        "tool_name": result.output.get("tool_name", "GUI Tool"),
                        "description": result.output.get("description", ""),
                        "outputs": state["variables"],
                        "execution_state": state_to_save,
                        "steps": [step.to_dict() for step in self.steps],
                        "error": None,
                        "started_at": started_at.isoformat(),
                        "completed_at": completed_at.isoformat(),
                         "duration_ms": int((completed_at - started_at).total_seconds() * 1000)
                    }
                }
                return
            
            # Get next node
            current_node = self._get_next_node(current_node, result)
            
            # Check step limit
            if steps_limit and steps_run >= steps_limit and current_node:
                state["current_node"] = current_node
                state_to_save = state.copy()
                if "db" in state_to_save: del state_to_save["db"]
                
                yield {
                    "type": "paused",
                    "data": {
                        "status": "paused",
                        "execution_state": state_to_save,
                        "outputs": state["variables"],
                        "steps": [step.to_dict() for step in self.steps],
                        "error": None,
                        "started_at": started_at.isoformat(),
                        "completed_at": None,
                    }
                }
                return
            
            # --- START EXECUTE STREAM CHANGE ---
            # Update state with current node for downstream consumers
            state["current_node"] = current_node 
            # Note: current_node is now the NEXT node (or None if finished)
            # We also want to track the LAST executed node.
            state["last_executed_node"] = current_step.node_id
            
        
        completed_at = datetime.utcnow()
        final_status = "completed" if not state["error"] else "failed"
        
        # Ensure current_node reflects the last legitimate node if we are done
        if not state["current_node"] and len(self.steps) > 0:
             state["current_node"] = self.steps[-1].node_id
        
        # Prepare filtered outputs (reusing logic from original execute)
        initial_inputs = state["inputs"]
        all_variables = state["variables"]
        last_node_id = state["current_node"]
        last_node = self.nodes.get(last_node_id) if last_node_id else None
        
        output_template = None
        if last_node:
            node_type = last_node.type if hasattr(last_node, 'type') else last_node.get('type')
            if hasattr(node_type, 'value'): node_type = node_type.value
            if node_type == "END":
                params = last_node.params if hasattr(last_node, 'params') else last_node.get('params', {})
                output_template = params.get("output_template")
                if isinstance(output_template, str):
                    try:
                        import json
                        output_template = json.loads(output_template)
                    except Exception: pass

        filtered_outputs = {}
        if output_template is not None and isinstance(output_template, dict):
            # Construct from template
             for key, template_str in output_template.items():
                if not isinstance(template_str, str):
                    filtered_outputs[key] = template_str
                    continue
                if template_str in all_variables:
                    filtered_outputs[key] = all_variables[template_str]
                else:
                    if "{{" in template_str:
                        try:
                            import jinja2
                            env = jinja2.Environment()
                            tmpl = env.from_string(template_str)
                            filtered_outputs[key] = tmpl.render(**all_variables)
                        except Exception:
                            filtered_outputs[key] = template_str
                    else:
                        filtered_outputs[key] = template_str
        else:
            # Default filtering
            for k, v in all_variables.items():
                if k is None: continue
                is_input = k in initial_inputs
                is_internal = isinstance(k, str) and k.startswith('_')
                if not is_input and not is_internal:
                    filtered_outputs[k] = v

        state_to_save = state.copy()
        if "db" in state_to_save: del state_to_save["db"]

        final_result = {
            "status": final_status,
            "outputs": filtered_outputs,
            "execution_state": state["variables"],
            "full_state": state_to_save,
            "steps": [step.to_dict() for step in self.steps],
            "error": state["error"],
            "started_at": started_at.isoformat(),
            "completed_at": completed_at.isoformat(),
            "duration_ms": int((completed_at - started_at).total_seconds() * 1000)
        }
        
        yield {
            "type": "complete",
            "data": final_result
        }

    async def execute(self, inputs: Dict[str, Any], initial_state: Optional[Dict[str, Any]] = None, steps_limit: Optional[int] = None) -> Dict[str, Any]:
        """
        Execute the agent workflow (blocking wrapper around execute_stream).
        """
        final_result = None
        async for event in self.execute_stream(inputs, initial_state, steps_limit):
            if event["type"] in ["complete", "paused", "waiting_for_input"]:
                final_result = event["data"]
            elif event["type"] == "error" and not final_result:
                 # If we hit an error event but didn't reach 'complete', construct error result
                 final_result = {
                    "status": "failed",
                    "error": event["content"],
                    "outputs": {},
                    "steps": [step.to_dict() for step in self.steps]
                 }
        
        if not final_result:
             return {
                "status": "failed",
                "error": "Execution interrupted or returned no result",
                "outputs": {},
                "steps": []
            }
            
        return final_result

    def resume_with_input(self, state: Dict[str, Any], input_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Update state with provided input and determine next node.
        Used when resuming from waiting_for_input status.
        """
        current_node_id = state.get("current_node")
        if not current_node_id:
            raise ValueError("No current node in state")
            
        # Get Current Node Definition to find Tool ID
        current_node = self.nodes.get(current_node_id)
        if current_node:
             params = current_node.params if hasattr(current_node, 'params') else current_node.get('params', {})
             # If CALL_TOOL, we need to inject the marker so it can consume it
             node_type = current_node.type if hasattr(current_node, 'type') else current_node.get('type')
             if hasattr(node_type, 'value'): node_type = node_type.value
             
             if node_type == "CALL_TOOL":
                 tool_id = params.get("tool_id")
                 if tool_id:
                     if "variables" not in state: state["variables"] = {}
                     # Set the marker with the input data
                     marker_key = f"_gui_submitted_for_{tool_id}"
                     state["variables"][marker_key] = input_data
                     print(f"[RUNTIME] Injected GUI marker for {marker_key} for resumption.")

        # DO NOT simulate execution. DO NOT advance node.
        # We want the scheduler to run the SAME node again.
        # The primitive (CallTool) will now see the marker, consume it (pop), and execute logic naturally.
        
        # Add to history (Optional, maybe log "Input Received")
        state["history"].append({
            "node": current_node_id,
            "success": True,
            "output": {"type": "input_received", "data": input_data},
            "error": None,
            "manual_input": True
        })
        
        # Keep current_node as-is.
        state["current_node"] = current_node_id
        
        return state


async def execute_blueprint(
    db,
    blueprint_id: str,
    inputs: Dict[str, Any],
    steps_limit: Optional[int] = None
) -> Dict[str, Any]:
    """
    Execute an agent blueprint.
    
    Args:
        db: Database session
        blueprint_id: ID of the blueprint to execute
        inputs: Input values for the workflow
        steps_limit: Optional limit on steps to execute
        
    Returns:
        Execution result
    """
    from app.models.agent_blueprint import AgentBlueprint, AgentExecution
    
    # Load blueprint
    blueprint = db.query(AgentBlueprint).filter(
        AgentBlueprint.id == blueprint_id
    ).first()
    
    if not blueprint:
        return {
            "status": "failed",
            "error": f"Blueprint not found: {blueprint_id}",
            "outputs": {},
            "steps": []
        }
    
    # Create execution record
    execution = AgentExecution(
        blueprint_id=blueprint_id,
        user_id=inputs.get("_user_id", 1),  # TODO: Get from auth
        inputs=inputs,
        status="running"
    )
    db.add(execution)
    db.commit()
    
    try:
        # Run the blueprint
        runtime = AgentRuntime(blueprint, db)
        result = await runtime.execute(inputs, steps_limit=steps_limit)
        
        # Update execution record
        execution.status = result["status"]
        execution.outputs = result.get("outputs", {})
        execution.error_message = result.get("error")
        execution.state = result.get("execution_state")
        
        if result["status"] in ["completed", "failed"]:
            execution.completed_at = datetime.utcnow()
            
        db.commit()
        
        result["execution_id"] = execution.id
        return result
        
    except Exception as e:
        execution.status = "failed"
        execution.error_message = str(e)
        execution.completed_at = datetime.utcnow()
        db.commit()
        
        return {
            "execution_id": execution.id,
            "status": "failed",
            "error": str(e),
            "outputs": {},
            "steps": []
        }

