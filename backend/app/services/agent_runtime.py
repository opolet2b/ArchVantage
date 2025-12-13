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
            if hasattr(node_type, 'value'):
                node_type = node_type.value
            if node_type == "START":
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
            step.complete(result.output, result.error if not result.success else None)
            return result
        except Exception as e:
            error_msg = str(e)
            step.complete({}, error_msg)
            return PrimitiveResult(success=False, error=error_msg)
    
    async def execute(self, inputs: Dict[str, Any]) -> Dict[str, Any]:
        """
        Execute the agent workflow.
        
        Args:
            inputs: Input values for the workflow
            
        Returns:
            Execution result with status, outputs, and steps
        """
        started_at = datetime.utcnow()
        
        # Initialize state
        state: AgentState = {
            "inputs": inputs,
            "variables": dict(inputs),  # Copy inputs to variables
            "secrets": {},
            "history": [],
            "current_node": None,
            "current_output": None,
            "error": None,
            "db": self.db
        }
        
        # Load secrets if blueprint ID available
        blueprint_id = getattr(self.blueprint, 'id', None) or (
            self.blueprint.get('id') if isinstance(self.blueprint, dict) else None
        )
        if blueprint_id and self.db:
            state["secrets"] = secret_manager.load_blueprint_secrets(
                self.db, blueprint_id
            )
        
        # Find starting node
        current_node = self._get_start_node()
        if not current_node:
            return {
                "status": "failed",
                "error": "No starting node found",
                "outputs": {},
                "steps": []
            }
        
        # Execute workflow
        max_iterations = 100  # Safety limit
        iteration = 0
        
        while current_node and iteration < max_iterations:
            iteration += 1
            state["current_node"] = current_node
            
            # Execute node
            result = await self._execute_node(current_node, state)
            
            # Update state with output
            if result.success and result.output:
                if isinstance(result.output, dict):
                    # Merge output into variables at top level (for direct access)
                    for key, value in result.output.items():
                        if not key.startswith('_'):
                            state["variables"][key] = value
                    
                    # Also store with node ID prefix (for explicit node references)
                    # This allows templates like {{json_mapping_xxx.field}} to resolve
                    state["variables"][current_node] = result.output
                    
                state["current_output"] = result.output
            
            # Add to history
            state["history"].append({
                "node": current_node,
                "success": result.success,
                "output": result.output,
                "error": result.error
            })
            
            # Check for failure
            if not result.success:
                state["error"] = result.error
                break
            
            # Check for GUI input required - halt execution and wait for user
            if (
                isinstance(result.output, dict) and
                result.output.get("type") == "gui_input_required"
            ):
                completed_at = datetime.utcnow()
                return {
                    "status": "waiting_for_input",
                    "waiting_node": current_node,
                    "gui_schema": result.output.get("gui_schema", {}),
                    "tool_name": result.output.get("tool_name", "GUI Tool"),
                    "description": result.output.get("description", ""),
                    "outputs": state["variables"],
                    "steps": [step.to_dict() for step in self.steps],
                    "error": None,
                    "started_at": started_at.isoformat(),
                    "completed_at": completed_at.isoformat(),
                    "duration_ms": int(
                        (completed_at - started_at).total_seconds() * 1000
                    )
                }
            
            # Get next node
            current_node = self._get_next_node(current_node, result)
        
        completed_at = datetime.utcnow()
        
        # Build response
        final_status = "completed" if not state["error"] else "failed"
        
        return {
            "status": final_status,
            "outputs": state["variables"],
            "steps": [step.to_dict() for step in self.steps],
            "error": state["error"],
            "started_at": started_at.isoformat(),
            "completed_at": completed_at.isoformat(),
            "duration_ms": int((completed_at - started_at).total_seconds() * 1000)
        }


async def execute_blueprint(
    db,
    blueprint_id: str,
    inputs: Dict[str, Any]
) -> Dict[str, Any]:
    """
    Execute an agent blueprint.
    
    Args:
        db: Database session
        blueprint_id: ID of the blueprint to execute
        inputs: Input values for the workflow
        
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
        result = await runtime.execute(inputs)
        
        # Update execution record
        execution.status = result["status"]
        execution.outputs = result.get("outputs", {})
        execution.error_message = result.get("error")
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
