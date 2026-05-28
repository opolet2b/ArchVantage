"""
Agent Runtime

Dynamic LangGraph execution engine that builds and runs workflows
from JSON Blueprint definitions.
"""
from typing import Any, Dict, List, Optional, TypedDict
from datetime import datetime
import uuid
import asyncio
import time
import json

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
        self.captured_schema = None
        self.sub_steps = []
    
    def complete(self, output: Any, error: Optional[str] = None):
        self.completed_at = datetime.utcnow()
        self.output_data = output if isinstance(output, dict) else {"result": output}
        self.status = "failed" if error else "completed"
        self.error = error
    
    def to_dict(self, sanitizer=None) -> Dict:
        data = {
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
            "sub_steps": self.sub_steps,
            "error": self.error
        }
        
        if sanitizer:
            return sanitizer(data)
        return data


class AgentRuntime:
    """
    Runtime engine for executing Agent Blueprints.
    
    Dynamically constructs LangGraph workflows from JSON blueprints
    and manages execution state.
    """
    
    def __init__(self, blueprint, db=None, origin: str = "Manual", model_override: Optional[str] = None):
        """
        Initialize the runtime with a blueprint.
        
        Args:
            blueprint: BlueprintResponse or dict containing the blueprint
            db: Optional database session
            origin: Tag for log differentiation (e.g. "Automation", "Manual")
            model_override: Global LLM model override for AI nodes
        """
        self.blueprint = blueprint
        self.db = db
        self.origin = origin
        self.model_override = model_override
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
    
    def _sanitize_for_json(self, obj, seen=None):
        """
        Recursively ensure object is JSON serializable and free of circular references.
        """
        if seen is None:
            seen = set()
        
        # Handle basic types
        if obj is None or isinstance(obj, (str, int, float, bool)):
            return obj
            
        # Check circularity for containers
        obj_id = id(obj)
        if obj_id in seen:
            return f"<Circular Reference {type(obj).__name__}>"
        
        # Add to seen
        seen.add(obj_id)
        
        try:
            if isinstance(obj, dict):
                return {str(k): self._sanitize_for_json(v, seen) for k, v in obj.items()}
            elif isinstance(obj, (list, tuple)):
                return [self._sanitize_for_json(v, seen) for v in obj]
            elif hasattr(obj, "dict"): # Pydantic
                return self._sanitize_for_json(obj.dict(), seen)
            elif hasattr(obj, "isoformat"): # Datetime
                return obj.isoformat()
            else:
                return str(obj)
        except Exception as e:
            return f"<Serialization Error: {str(e)}>"
        finally:
            # Remove from seen to allow DAGs (Diamonds), only blocking Cycles
            seen.remove(obj_id)

    def _build_graph_maps(self):
        """Build maps for quick node/edge lookup."""
        # Handle both Pydantic models and dicts
        nodes = self.graph_def.nodes if hasattr(self.graph_def, 'nodes') else self.graph_def.get('nodes', [])
        
        # Check if we have linear 'steps' instead of nodes (Studio format)
        steps = self.graph_def.steps if hasattr(self.graph_def, 'steps') else self.graph_def.get('steps', [])
        
        # FIX: Robustly handle stringified steps
        if isinstance(steps, str):
            try:
                import json
                steps = json.loads(steps)
                print(f"[RUNTIME] Parsed stringified steps: {len(steps)} items")
            except Exception as e:
                print(f"[RUNTIME] Failed to parse steps string: {e}")
                steps = []
        
        edges = []
        
        # Debug Logging to File
        try:
            with open("execution_debug.log", "a", encoding="utf-8") as f:
                ts = datetime.utcnow().isoformat()
                n_count = len(nodes) if nodes else 0
                s_count = len(steps) if steps else 0
                f.write(f"\n[{ts}] [RUNTIME INIT] [{self.origin}] Nodes: {n_count}, Steps: {s_count}\n")
                print(f"[RUNTIME DEBUG] Graph Def Keys: {list(self.graph_def.keys()) if isinstance(self.graph_def, dict) else 'Not Dict'}")
                if nodes:
                    print(f"[RUNTIME DEBUG] First Node Keys: {nodes[0].keys() if isinstance(nodes[0], dict) else 'Not Dict'}")
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

                # Normalize 'primitive' to 'type' if present (used in automated definitions)
                if 'primitive' in step and 'type' not in step:
                    step['type'] = step['primitive']

                # SKIP DISABLED STEPS
                # Check explicit 'enabled' flag (default True)
                if step.get('enabled') is False:
                     print(f"[RUNTIME] Skipping disabled step: {step_id}")
                     continue

                # Map Studio 'config'/'inputs' to Primitive 'params'
                config = step.get('config', {})
                params = step.get('params', {})
                inputs = step.get('inputs', {})
                
                if config or params or inputs:
                    # Merge all potential parameter sources
                    merged_params = {**config, **inputs, **params}
                    
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
                        
                        # Only add if value exists and is not empty
                        if "sourceSections" in merged_params:
                            val = merged_params.pop('sourceSections')
                            if val: instructions_parts.append(f"Source Sections: {val}")

                        if "focus" in merged_params:
                            val = merged_params.pop('focus')
                            if val: instructions_parts.append(f"Focus: {val}")

                        if "exclude" in merged_params:
                            val = merged_params.pop('exclude')
                            if val: instructions_parts.append(f"Exclude: {val}")

                        if "additionalInstructions" in merged_params:
                            val = merged_params.pop('additionalInstructions')
                            if val: instructions_parts.append(f"Instructions: {val}")
                        
                        if instructions_parts:
                            merged_params["instruction"] = "\n".join(instructions_parts)

                    elif "visualizer" in step_type:
                        # Ensure specific visualizer fields are passed
                        if "templateId" in merged_params:
                            merged_params["template_id"] = merged_params.pop("templateId")
                        if "renderingType" in merged_params:
                            # Keep both for safety as some logic uses renderingType
                            merged_params["rendering_type_id"] = merged_params["renderingType"]

                    step['params'] = merged_params
                    print(f"[RUNTIME DEBUG] Step '{step_id}' params resolved: {list(merged_params.keys())}")
                
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
                
                # Create sequential edge based on previously added node (not original steps index)
                if len(nodes) > 1:
                    prev_id = nodes[-2].get('id')
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
        # 0. Check for explicit start_node in graph definition
        if isinstance(self.graph_def, dict) and "start_node" in self.graph_def:
            start_node = self.graph_def["start_node"]
            if start_node in self.nodes:
                print(f"[RUNTIME] Found explicit start node: {start_node}")
                return start_node
            else:
                 print(f"[RUNTIME WARNING] Graph defines start_node '{start_node}' but it is not in nodes map: {list(self.nodes.keys())}")

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
    
    def _get_next_node(self, current_node: str, result: PrimitiveResult, state: AgentState) -> Optional[str]:
        """Determine the next node based on edges and result."""
        print(f"[RUNTIME] Determining NEXT NODE from '{current_node}'...")
        # 1. Get all outgoing edges
        edges = self.edges.get(current_node, [])
        print(f"[RUNTIME DEBUG] Found {len(edges)} outgoing edges for '{current_node}'.")
        
        if not edges:
            print(f"[RUNTIME] No outgoing edges from '{current_node}'. Execution will stop.")
            return None

        # 2. Extract logical branch if available
        logical_branch = None
        if isinstance(result.output, dict):
            logical_branch = result.output.get("logical_branch")
        
        # Fallback for handle names as jump targets
        if not logical_branch and result.next_node in ["then", "else", "done", "body", "loop", "true", "false", "default"]:
            logical_branch = result.next_node

        # 3. Handle Logical Branching via sourceHandle with synonyms and casing normalization
        if logical_branch:
            lb_lower = str(logical_branch).lower()
            
            # Map synonyms
            synonyms = {
                "then": ["then", "true", "yes", "success"],
                "else": ["else", "false", "no", "failure"],
                "true": ["then", "true", "yes"],
                "false": ["else", "false", "no"]
            }
            possible_matches = synonyms.get(lb_lower, [lb_lower])
            
            print(f"[RUNTIME] Logic Result: '{logical_branch}' (Lower: '{lb_lower}', Looking for: {possible_matches})")
            
            # Diagnostic: Print all available handles
            available_handles = [e.get("sourceHandle") for e in edges if e.get("sourceHandle")]
            print(f"[RUNTIME DEBUG] Available outgoing handles from {current_node}: {available_handles}")

            for edge in edges:
                handle = edge.get("sourceHandle")
                if not handle: continue
                
                h_lower = str(handle).lower()
                # Check direct match OR synonym match
                if h_lower == lb_lower or h_lower in possible_matches:
                    print(f"[RUNTIME] Found matching edge handle '{handle}' -> {edge.get('target')}")
                    return edge.get("target")
            
            print(f"[RUNTIME WARNING] Logic result '{logical_branch}' had no matching edge handle in {available_handles}.")

        # 4. Explicit override from Primitive (Literal Node ID Jumps)
        if result.next_node and not logical_branch:
            print(f"[RUNTIME] Manual Jump: {current_node} -> {result.next_node}")
            return result.next_node
        
        # 5. Conditional or Default Traversal
        default_edge = None
        for edge in edges:
            condition = edge.get('condition')
            handle = edge.get('sourceHandle')

            # Skip handles that don't match our logic result
            if logical_branch and handle:
                lb_lower = str(logical_branch).lower()
                h_lower = str(handle).lower()
                
                synonyms = {
                    "then": ["then", "true", "yes", "success"],
                    "else": ["else", "false", "no", "failure"],
                    "true": ["then", "true", "yes"],
                    "false": ["else", "false", "no"]
                }
                possible_matches = synonyms.get(lb_lower, [lb_lower])
                
                if h_lower != lb_lower and h_lower not in possible_matches:
                    continue

            if condition:
                try:
                    eval_ctx = {
                        "result": result.output if result else {}, 
                        "variables": state.get("variables", {}),
                        "datetime": datetime
                    }
                    if eval(condition, {"__builtins__": {}}, eval_ctx):
                        print(f"[RUNTIME] Condition matched: '{condition}' -> {edge.get('target')}")
                        return edge.get("target")
                except Exception as e:
                    print(f"[RUNTIME] Condition error '{condition}': {e}")
            elif not handle:
                default_edge = edge.get("target")

        if default_edge:
            print(f"[RUNTIME] Taking default unconditional path -> {default_edge}")
            return default_edge
        
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
        # Snapshot variables to avoid reference bloat in the trace
        step.input_data = {"params": params, "variables": dict(state.get("variables", {}))}
        self.steps.append(step)
        
        # Execute primitive
        try:
            result = await primitive.execute(params, state)
            print(f"[RUNTIME DEBUG] Primitive {node_type} execution finished. Success: {result.success}")
            if not result.success:
                print(f"[RUNTIME DEBUG] Primitive Error: {result.error}")
            
            # Capture schema if successful
            if result.success:
                try:
                    print(f"[RUNTIME DEBUG] Inferring schema for node {node_id}...")
                    step.captured_schema = SchemaDiscoveryService.infer_schema_from_data(result.output)
                    print(f"[RUNTIME DEBUG] Schema inference complete.")
                except Exception as e:
                    print(f"[RUNTIME WARNING] Failed to infer schema for node {node_id}: {e}")

            print(f"[RUNTIME DEBUG] Calling step.complete...")
            if hasattr(result, "steps") and result.steps:
                step.sub_steps = result.steps
            step.complete(result.output, result.error if not result.success else None)
            print(f"[RUNTIME DEBUG] step.complete done. Returning result.")
            return result
        except Exception as e:
            error_msg = str(e)
            step.complete({}, error_msg)
            return PrimitiveResult(success=False, error=error_msg)
    
    async def execute_stream(self, inputs: Dict[str, Any], initial_state: Optional[Dict[str, Any]] = None, steps_limit: Optional[int] = None):
        """
        Execute the agent workflow as a stream of events.
        """
        started_at = datetime.utcnow()
        state = {}
        
        try:
            # 1. Initialize State
            if initial_state:
                print(f"[RUNTIME] Resuming with initial_state. Keys: {list(initial_state.keys())}")
                state = initial_state
                state["db"] = self.db
                if "inputs" not in state: state["inputs"] = inputs
                current_node = state.get("current_node")
                print(f"[RUNTIME] Resumed current_node: {current_node}")
                
                if not current_node:
                    print("[RUNTIME] No current_node in state, falling back to START.")
                    current_node = self._get_start_node()
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

            # 2. Model Override
            if self.model_override:
                if "variables" not in state: state["variables"] = {}
                state["variables"]["_execution_model"] = self.model_override
                state["variables"]["model"] = self.model_override

            if not current_node:
                yield {"type": "error", "content": "No starting node found"}
                return

            # 3. Load Secrets
            if not initial_state:
                blueprint_id = getattr(self.blueprint, 'id', None) or (
                    self.blueprint.get('id') if isinstance(self.blueprint, dict) else None
                )
                if blueprint_id and self.db:
                    state["secrets"] = secret_manager.load_blueprint_secrets(self.db, blueprint_id)
            
            # 4. Yield Start Event
            state_for_event = state.copy()
            if "db" in state_for_event: del state_for_event["db"]
            start_event = {"type": "start", "state": self._sanitize_for_json(state_for_event)}
            print(f"[RUNTIME] Yielding START event: {start_event['type']}")
            yield start_event
                
            max_iterations = 100
            iteration = 0
            steps_run = 0

            # 5. Main Execution Loop
            while current_node and iteration < max_iterations:
                iteration += 1
                steps_run += 1
                state["current_node"] = current_node
                
                print(f"[RUNTIME] Executing Node: {current_node} (Iteration {iteration})")
                
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
    
                # Setup Monitoring
                start_time = time.time()
                status_queue = asyncio.Queue()
                
                async def status_callback(msg: str): 
                    await status_queue.put(msg)
                
                if "status_callbacks" not in state: state["status_callbacks"] = []
                state["status_callbacks"].append(status_callback)
    
                # Execute Node Task
                node_task = asyncio.create_task(self._execute_node(current_node, state))
                
                # Simple Wait Loop with status checking
                while not node_task.done():
                    try:
                        # Check for status messages without blocking forever
                        while not status_queue.empty():
                            msg = status_queue.get_nowait()
                            yield {"type": "log", "level": "info", "message": msg}
                        
                        # Brief sleep to allow node_task to progress and avoid CPU spin
                        await asyncio.sleep(0.1)
                        
                        # Periodic progress update (every 5 seconds)
                        elapsed = int(time.time() - start_time)
                        if elapsed > 0 and elapsed % 5 == 0:
                            # Use a simple flag or check if we already printed for this elapsed time
                            if not hasattr(self, "_last_heartbeat") or self._last_heartbeat != elapsed:
                                print(f"[RUNTIME DEBUG] Iteration {iteration} of node {current_node} still running... (elapsed: {elapsed}s)")
                                self._last_heartbeat = elapsed
                                yield {"type": "progress", "message": f"Working... ({elapsed}s)"}
                            
                    except Exception as e:
                        print(f"[RUNTIME DEBUG] Wait loop error in node {current_node}: {e}")
                        break
    
                # Cleanup and Result
                yield {"type": "log", "level": "debug", "message": "[RUNTIME] Awaiting node_task final result..."}
                result = await node_task
                yield {"type": "log", "level": "debug", "message": f"[RUNTIME] node_task result received. Success: {result.success}"}
                
                if status_callback in state.get("status_callbacks", []):
                    state["status_callbacks"].remove(status_callback)
    
                if not result.success:
                    state["error"] = result.error
                    break
                
                # Update Variables
                yield {"type": "log", "level": "debug", "message": f"[RUNTIME] Updating state variables for node {current_node}..."}
                state["variables"][current_node] = result.output
                if isinstance(result.output, dict):
                    for key, value in result.output.items():
                        state["variables"][key] = value
                
                state["current_output"] = result.output
                yield {"type": "log", "level": "debug", "message": "[RUNTIME] State variables updated."}
                
                # Yield Step Result
                node_def = self.nodes.get(current_node, {})
                node_type = node_def.type if hasattr(node_def, 'type') else node_def.get('type', 'UNKNOWN')
                if hasattr(node_type, 'value'): node_type = node_type.value
                
                yield {"type": "log", "level": "debug", "message": f"[RUNTIME] Yielding step result for {current_node}..."}
                step_event = {
                    "type": "step",
                    "node_id": current_node,
                    "node_type": node_type,
                    "output_data": result.output,
                    "duration_ms": int((time.time() - start_time) * 1000)
                }
                print(f"[RUNTIME] Yielding STEP event: {step_event['type']} for {current_node}")
                yield step_event
                yield {"type": "log", "level": "debug", "message": "[RUNTIME] Step result yielded."}
    
                # Record in History
                state["history"].append({"node": current_node, "output": result.output})
                print(f"[RUNTIME] Node {current_node} history recorded. Moving to next node determination...")
                
                # --- FOREACH SUB-GRAPH EXECUTION ---
                if result.success and isinstance(result.output, dict) and "_foreach_subprocess" in result.output:
                    try:
                        subprocess_def = result.output["_foreach_subprocess"]
                        items = result.output.get("_foreach_items", [])
                        iterator_var = result.output.get("_foreach_iterator", "item")
                        index_var = result.output.get("_foreach_index", "index")
                        target_output_var = next((k for k in result.output.keys() if not k.startswith("_")), "foreach_results")
                        
                        print(f"[RUNTIME] executing ForEach Sub-Graph for {len(items)} items...")
                        subprocess_results = []
                        subprocess_histories = []
                        
                        for idx, item in enumerate(items):
                            sub_inputs = state["variables"].copy() 
                            sub_inputs[iterator_var] = item
                            sub_inputs[index_var] = idx
                            
                            yield {"type": "log", "level": "info", "message": f"-> Processing item {idx+1}/{len(items)}..."}

                            sub_runtime = AgentRuntime({"graph": subprocess_def}, self.db, model_override=self.model_override)
                            sub_res = await sub_runtime.execute(sub_inputs)
                            
                            item_out = sub_res.get("outputs", {})
                            subprocess_results.append(item_out)
                            subprocess_histories.append(sub_res.get("steps", []))
                            
                            # Merge iteration results back to state
                            for k, v in item_out.items():
                                if not k.startswith("_"): state["variables"][k] = v
                         
                        state["variables"][target_output_var] = subprocess_results
                        result.output[target_output_var] = subprocess_results
                        print(f"[RUNTIME] ForEach Complete. Aggregated {len(subprocess_results)} results.")

                    except Exception as e:
                        print(f"[RUNTIME] ForEach Sub-Execution Failed: {e}")
                        state["error"] = f"ForEach Error: {str(e)}"
                        break
                # -----------------------------------

                # Check for GUI input
                if result.error == "WAITING_FOR_INPUT" or (result.output and result.output.get("type") == "gui_input_required"):
                    state["status"] = "waiting_for_input"
                    state_to_save = state.copy()
                    if "db" in state_to_save: del state_to_save["db"]
                    yield {
                        "type": "complete",
                        "status": "waiting_for_input",
                        "data": self._sanitize_for_json({
                            "status": "waiting_for_input",
                            "execution_state": state_to_save,
                            "outputs": state["variables"],
                            "steps": [step.to_dict(self._sanitize_for_json) for step in self.steps],
                            "gui_schema": result.output.get("gui_schema"),
                            "initial_values": result.output.get("initial_values"),
                            "tool_name": result.output.get("tool_name"),
                            "description": result.output.get("description"),
                            "waiting_node": current_node
                        })
                    }
                    return
                
                # Next Node
                yield {"type": "log", "level": "debug", "message": "[RUNTIME] Calculating next node..."}
                current_node = self._get_next_node(current_node, result, state)
                yield {"type": "log", "level": "debug", "message": f"[RUNTIME] Next node calculated: {current_node}"}
                
                # Step Limit Check
                if steps_limit and steps_run >= steps_limit and current_node:
                    state["current_node"] = current_node
                    state["status"] = "paused"
                    state_to_save = state.copy()
                    if "db" in state_to_save: del state_to_save["db"]
                    
                    # CLEANUP: Cancel pending tasks before pausing
                    if not node_task.done(): node_task.cancel()
                    if queue_task and not queue_task.done(): queue_task.cancel()
                    
                    yield {
                        "type": "paused",
                        "data": self._sanitize_for_json({
                            "status": "paused",
                            "execution_state": state_to_save,
                            "outputs": state["variables"],
                            "steps": [step.to_dict(self._sanitize_for_json) for step in self.steps],
                            "started_at": started_at.isoformat()
                        })
                    }
                    return
        
        except Exception as e:
            import traceback
            error_msg = f"Runtime Crash: {str(e)}\n{traceback.format_exc()}"
            yield {"type": "error", "content": error_msg}
        finally:
            # Final Completion Event
            completed_at = datetime.utcnow()
            
            # Determine correct final status
            current_status = state.get("status", "completed")
            if state.get("error"):
                current_status = "failed"
            elif iteration >= max_iterations:
                current_status = "failed"
                state["error"] = "Max iterations reached"
            elif current_node is None:
                # Workflow finished naturally, force status to completed
                current_status = "completed"
                state["status"] = "completed"
            
            state_to_save = state.copy() if state else {}
            if "db" in state_to_save: del state_to_save["db"]
            if "variables" in state_to_save: state_to_save["variables"] = dict(state_to_save["variables"])
            if "status_callbacks" in state_to_save: del state_to_save["status_callbacks"]
            
            # 7. Collect Final Outputs
            # If we ended on an END node, it likely has a filtered output.
            # Otherwise, fallback to all variables.
            final_outputs = state.get("variables", {})
            last_output = state.get("current_output")
            
            print(f"[RUNTIME] Workflow ending. Status: {current_status}. Variables count: {len(final_outputs)}")
            
            if current_status == "completed" and isinstance(last_output, dict) and last_output.get("_completed"):
                # Use the clean output from the END node, but keep _completed flag
                final_outputs = last_output
            
            final_result = {
                "status": current_status,
                "outputs": final_outputs,
                "execution_state": state_to_save,
                "steps": [step.to_dict(self._sanitize_for_json) for step in self.steps],
                "error": state.get("error"),
                "started_at": started_at.isoformat(),
                "completed_at": completed_at.isoformat()
            }
            
            if current_status == "waiting_for_input":
                if isinstance(last_output, dict):
                    final_result["gui_schema"] = last_output.get("gui_schema")
                    final_result["initial_values"] = last_output.get("initial_values")
                    final_result["tool_name"] = last_output.get("tool_name")
                    final_result["description"] = last_output.get("description")
                    final_result["waiting_node"] = state.get("current_node")
                    
            yield {"type": "complete", "data": self._sanitize_for_json(final_result)}

    async def execute(self, inputs: Dict[str, Any], initial_state: Optional[Dict[str, Any]] = None, steps_limit: Optional[int] = None) -> Dict[str, Any]:
        """
        Execute the agent workflow (blocking wrapper around execute_stream).
        """
        final_result = None
        logs = []
        async for event in self.execute_stream(inputs, initial_state, steps_limit):
            if event["type"] in ["complete", "paused", "waiting_for_input"]:
                final_result = event["data"]
            elif event["type"] == "log":
                logs.append({
                    "level": event.get("level", "info"),
                    "message": event["message"],
                    "timestamp": event.get("timestamp", datetime.utcnow().isoformat()),
                    "node_id": event.get("node_id"),
                    "node_label": event.get("node_label")
                })
            elif event["type"] == "error" and not final_result:
                 # If we hit an error event but didn't reach 'complete', construct error result
                 final_result = {
                    "status": "failed",
                    "error": event["content"],
                    "outputs": {},
                    "steps": [step.to_dict(self._sanitize_for_json) for step in self.steps]
                 }
        
        if final_result:
            final_result["logs"] = logs
            if "started_at" not in final_result:
                final_result["started_at"] = datetime.utcnow().isoformat()
            return final_result
        
        # Fallback for interrupted execution
        now = datetime.utcnow().isoformat()
        return {
            "status": "failed",
            "error": "Execution interrupted or returned no result",
            "outputs": {},
            "steps": [],
            "started_at": now,
            "completed_at": now
        }

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
    steps_limit: Optional[int] = None,
    model: Optional[str] = None
) -> Dict[str, Any]:
    """
    Execute an agent blueprint.
    
    Args:
        db: Database session
        blueprint_id: ID of the blueprint to execute
        inputs: Input values for the workflow
        steps_limit: Optional limit on steps to execute
        model: Global LLM model override
        
    Returns:
        Execution result
    """
    from app.models.agent_blueprint import AgentBlueprint, AgentExecution
    
    # Load blueprint
    blueprint = db.query(AgentBlueprint).filter(
        AgentBlueprint.id == blueprint_id
    ).first()
    
    if not blueprint:
        now = datetime.utcnow().isoformat()
        return {
            "status": "failed",
            "error": f"Blueprint not found: {blueprint_id}",
            "outputs": {},
            "steps": [],
            "started_at": now,
            "completed_at": now
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
        runtime = AgentRuntime(blueprint, db, model_override=model)
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
        now = datetime.utcnow().isoformat()
        execution.status = "failed"
        execution.error_message = str(e)
        execution.completed_at = datetime.utcnow()
        db.commit()
        
        return {
            "execution_id": execution.id,
            "status": "failed",
            "error": str(e),
            "outputs": {},
            "steps": [],
            "started_at": now,
            "completed_at": now
        }

