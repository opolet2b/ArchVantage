"""
Agent Schemas

Pydantic schemas for Agent Blueprint validation and serialization.
These schemas support the JSON Blueprint DSL defined in the specification.
"""
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime
from enum import Enum


class PrimitiveType(str, Enum):
    """Standard primitive types available in the Agent Builder."""
    START = "START"
    END = "END"
    HTTP_REQUEST = "HTTP_REQUEST"
    CALL_TOOL = "CALL_TOOL"
    CONDITION = "CONDITION"
    JSON_MAPPING = "JSON_MAPPING"
    TEXT_TEMPLATE = "TEXT_TEMPLATE"
    FOREACH = "FOREACH"
    LLM_DECISION = "LLM_DECISION"


# -----------------------------------------------------------------------------
# Node Position & Metadata
# -----------------------------------------------------------------------------

class NodePosition(BaseModel):
    """UI position for a node in the graph editor."""
    x: float = 0
    y: float = 0


class NodeMetadata(BaseModel):
    """Display metadata for a graph node."""
    label: str
    ui_position: NodePosition = Field(default_factory=NodePosition)


# -----------------------------------------------------------------------------
# Graph Structure
# -----------------------------------------------------------------------------

class GraphNode(BaseModel):
    """
    A single node in the agent graph.
    
    Each node has a type (primitive) and parameters specific to that type.
    """
    id: str
    type: PrimitiveType
    metadata: NodeMetadata
    params: Dict[str, Any] = Field(default_factory=dict)


class GraphEdge(BaseModel):
    """
    An edge connecting two nodes in the agent graph.
    
    The optional condition field supports branching logic.
    """
    id: str
    source: str  # Source node ID
    target: str  # Target node ID
    condition: Optional[str] = None  # Optional expression for branching


class AgentGraph(BaseModel):
    """Complete graph structure with nodes and edges."""
    nodes: List[GraphNode] = Field(default_factory=list)
    edges: List[GraphEdge] = Field(default_factory=list)


# -----------------------------------------------------------------------------
# Blueprint CRUD Schemas
# -----------------------------------------------------------------------------

class BlueprintBase(BaseModel):
    """Base fields for blueprint creation and updates."""
    name: str
    description: Optional[str] = None
    graph: AgentGraph = Field(default_factory=AgentGraph)
    inputs_schema: Dict[str, Any] = Field(default_factory=dict)
    secrets_requirements: List[str] = Field(default_factory=list)


class BlueprintCreate(BlueprintBase):
    """Schema for creating a new blueprint."""
    pass


class BlueprintUpdate(BaseModel):
    """Schema for updating an existing blueprint."""
    name: Optional[str] = None
    description: Optional[str] = None
    graph: Optional[AgentGraph] = None
    inputs_schema: Optional[Dict[str, Any]] = None
    secrets_requirements: Optional[List[str]] = None
    is_published: Optional[bool] = None


class BlueprintResponse(BlueprintBase):
    """Full blueprint response including metadata."""
    id: str
    version: str = "1.0"
    owner_id: int
    is_published: bool = False
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class BlueprintListItem(BaseModel):
    """Lightweight blueprint item for list views."""
    id: str
    name: str
    description: Optional[str]
    version: str
    is_published: bool
    inputs_schema: Dict[str, Any] = Field(default_factory=dict)
    created_at: datetime

    class Config:
        from_attributes = True


# -----------------------------------------------------------------------------
# Blueprint Generation (NL → Blueprint)
# -----------------------------------------------------------------------------

class CanvasContext(BaseModel):
    """Current canvas state for wiring components together."""
    nodes: List[Dict[str, Any]] = Field(
        default_factory=list,
        description="Components on the canvas with id, type, label, params"
    )
    edges: List[Dict[str, Any]] = Field(
        default_factory=list,
        description="Existing connections between components"
    )


class BlueprintGenerateRequest(BaseModel):
    """Request to generate a blueprint from natural language."""
    prompt: str = Field(..., min_length=10, description="User's description")
    model: str = Field(default="default", description="LLM model to use")
    selected_tool_ids: List[int] = Field(
        default_factory=list,
        description="Tool IDs selected by user for generation"
    )
    selected_apis: List[Dict[str, Any]] = Field(
        default_factory=list,
        description="HTTP API configurations selected by user"
    )
    canvas_context: Optional[CanvasContext] = Field(
        default=None,
        description="Current canvas components to wire together"
    )


class BlueprintGenerateResponse(BaseModel):
    """Response from blueprint generation."""
    blueprint: BlueprintResponse
    discovered_tools: List[str] = Field(default_factory=list)


# -----------------------------------------------------------------------------
# Blueprint Execution
# -----------------------------------------------------------------------------

class BlueprintExecuteRequest(BaseModel):
    """Request to execute a blueprint."""
    inputs: Dict[str, Any] = Field(default_factory=dict)


class ExecutionStatus(str, Enum):
    """Status of a blueprint execution."""
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


class ExecutionStep(BaseModel):
    """A single step in the execution trace."""
    node_id: str
    node_type: PrimitiveType
    status: ExecutionStatus
    input_data: Dict[str, Any] = Field(default_factory=dict)
    output_data: Optional[Dict[str, Any]] = None
    error: Optional[str] = None
    duration_ms: Optional[int] = None


class BlueprintExecuteResponse(BaseModel):
    """Response from blueprint execution."""
    execution_id: int
    status: ExecutionStatus
    outputs: Dict[str, Any] = Field(default_factory=dict)
    steps: List[ExecutionStep] = Field(default_factory=list)
    error_message: Optional[str] = None
    started_at: datetime
    completed_at: Optional[datetime] = None


# -----------------------------------------------------------------------------
# Secret Management
# -----------------------------------------------------------------------------

class SecretCreate(BaseModel):
    """Request to create/update a secret."""
    key_name: str
    value: str  # Plain text, will be encrypted before storage


class SecretResponse(BaseModel):
    """Secret response (value is never exposed)."""
    id: int
    key_name: str
    created_at: datetime

    class Config:
        from_attributes = True


# -----------------------------------------------------------------------------
# Primitive Parameter Schemas (for validation)
# -----------------------------------------------------------------------------

class HTTPRequestParams(BaseModel):
    """Parameters for HTTP_REQUEST primitive."""
    method: str = Field(
        default="GET", 
        pattern="^(GET|POST|PUT|PATCH|DELETE)$"
    )
    url: str
    headers: Dict[str, str] = Field(default_factory=dict)
    body: Optional[Dict[str, Any]] = None


class CallToolParams(BaseModel):
    """Parameters for CALL_TOOL primitive."""
    tool_id: int
    arguments: Dict[str, Any] = Field(default_factory=dict)


class ConditionParams(BaseModel):
    """Parameters for CONDITION primitive."""
    expression: str  # Expression to evaluate
    true_target: str  # Node ID if true
    false_target: str  # Node ID if false


class JSONMappingParams(BaseModel):
    """Parameters for JSON_MAPPING primitive."""
    source: str  # Variable name or path to source data
    template: str  # JMESPath expression


class TextTemplateParams(BaseModel):
    """Parameters for TEXT_TEMPLATE primitive."""
    template_string: str  # Jinja2 template
    variables: Dict[str, str] = Field(default_factory=dict)


class ForEachParams(BaseModel):
    """Parameters for FOREACH primitive."""
    items: str  # Variable name containing the list
    iterator_var: str = "item"  # Variable name for current item
    subprocess_graph: AgentGraph  # Sub-graph to execute for each item


class LLMDecisionParams(BaseModel):
    """Parameters for LLM_DECISION primitive."""
    model: str = "default"
    instruction: str
    input_context: str  # Variable or expression for input
    output_variable: str = "llm_output"
