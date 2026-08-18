"""
ArchVantage Schemas

Pydantic schemas for canvas API requests and responses.

PEP 8 Compliant
"""
from datetime import datetime
from typing import Optional, List, Dict, Any, Union
from pydantic import BaseModel, Field
from enum import Enum


# =============================================================================
# Enums
# =============================================================================

class ThingType(str, Enum):
    """Types of things on the canvas."""
    TEXT = "text"
    CONVERSATION = "conversation"
    MESSAGE = "message"
    DOCUMENT = "document"
    IMAGE = "image"
    VIDEO = "video"
    DATABASE = "database"
    TABLE = "table"
    AGENT_RESULT = "agent_result"
    AGENT_TOOL = "agent_tool"
    URL = "url"
    SLIDESHOW = "slideshow"
    MCP_TOOL = "mcp_tool"
    ARCHIMATE_TOOL = "archimate_tool"
    ARCHIMATE_ELEMENT = "archimate_element"
    STICKY = "sticky"
    WORKFLOW = "workflow"
    VOCAL_NOTE = "vocal_note"
    FORM_TOOL = "form_tool"
    SPREADSHEET = "spreadsheet"
    GAP_ANALYSIS_TOOL = "gap_analysis_tool"
    TRADE_OFF_MATRIX = "trade_off_matrix"
    ARCHITECTURE_MEMO = "architecture_memo"
    TIME_MATRIX_TOOL = "time_matrix_tool"
    PROJECT_IMPACT_SIMULATOR_TOOL = "project_impact_simulator_tool"
    ARCHITECTURAL_SCENARIO_TOOL = "architectural_scenario_tool"
    EXECUTIVE_SUMMARY_TOOL = "executive_summary_tool"
    COMPLIANCE_AUDIT_TOOL = "compliance_audit_tool"


class LinkType(str, Enum):
    """Types of relationships between things."""
    RELATED = "related"
    REFERENCES = "references"
    DERIVED_FROM = "derived_from"
    CONTAINS = "contains"
    PROVES = "proves"
    REFUTES = "refutes"
    PREREQUISITE = "prerequisite"
    INFLUENCES = "influences"
    TRIGGERS = "triggers"
    BLOCKS = "blocks"
    SUPERSEDES = "supersedes"
    # Scenarios can add more dynamic types, validation should be loose or handled separately


# =============================================================================
# Canvas
# =============================================================================

class ViewportState(BaseModel):
    """Canvas viewport state for pan/zoom."""
    x: float = 0.0
    y: float = 0.0
    zoom: float = 1.0


class PermissionLevel(str, Enum):
    """Levels of access for a shared canvas."""
    READ = "read"
    WRITE = "write"


class UserPermission(BaseModel):
    """User-specific canvas permission."""
    user_id: int
    level: PermissionLevel = PermissionLevel.READ


class RolePermission(BaseModel):
    """Role-specific canvas permission."""
    role_id: int
    level: PermissionLevel = PermissionLevel.READ


class CanvasCreate(BaseModel):
    """Request to create a new canvas."""
    name: str = "My Canvas"
    description: Optional[str] = None
    user_permissions: List[UserPermission] = []
    role_permissions: List[RolePermission] = []
    owner_config: Optional[Dict[str, Any]] = None



class CanvasUpdate(BaseModel):
    """Request to update a canvas."""
    name: Optional[str] = None
    description: Optional[str] = None
    viewport: Optional[ViewportState] = None
    user_permissions: Optional[List[UserPermission]] = None
    role_permissions: Optional[List[RolePermission]] = None
    owner_config: Optional[Dict[str, Any]] = None
    position: Optional[int] = None


class CanvasResponse(BaseModel):
    """Canvas response model."""
    id: str
    owner_id: int
    name: str
    description: Optional[str]
    viewport: ViewportState
    user_permissions: List[UserPermission] = []
    role_permissions: List[RolePermission] = []
    owner_config: Optional[Dict[str, Any]] = None
    position: int = 0
    analysis_space_id: Optional[str] = None
    # Effective permission for the current user (computed on the fly)
    access_level: Optional[PermissionLevel] = PermissionLevel.READ
    created_at: datetime
    updated_at: Optional[datetime]

    class Config:
        from_attributes = True


class CanvasWithContents(CanvasResponse):
    """
    Canvas response with all things, links, and domains.
    Used for loading entire canvas state.
    """
    things: List["ThingResponse"] = []
    links: List["LinkResponse"] = []
    domains: List["DomainResponse"] = []


# =============================================================================
# Things
# =============================================================================

class Position(BaseModel):
    """Position on canvas."""
    x: float = 0.0
    y: float = 0.0


class Size(BaseModel):
    """Size of a thing."""
    width: Optional[float] = None
    height: Optional[float] = None


class ScrapeOptions(BaseModel):
    """Options for URL scraping."""
    depth: int = 0
    warn_external: bool = True


class ThingCreate(BaseModel):
    """Request to create a thing on the canvas."""
    type: ThingType
    content: Dict[str, Any] = Field(default_factory=dict)
    technical_metadata: Dict[str, Any] = Field(default_factory=dict)
    custom_metadata: Dict[str, Any] = Field(default_factory=dict)
    position: Position = Field(default_factory=Position)
    size: Optional[Size] = None
    domain_id: Optional[str] = None
    title: Optional[str] = None
    color: Optional[str] = None
    z_index: float = 0.0
    scrape_options: Optional[ScrapeOptions] = None


class ThingUpdate(BaseModel):
    """Request to update a thing."""
    content: Optional[Dict[str, Any]] = None
    technical_metadata: Optional[Dict[str, Any]] = None
    custom_metadata: Optional[Dict[str, Any]] = None
    position: Optional[Position] = None
    size: Optional[Size] = None
    domain_id: Optional[str] = None
    title: Optional[str] = None
    color: Optional[str] = None
    z_index: Optional[float] = None
    collapsed: Optional[bool] = None
    # Iconify feature fields
    iconified: Optional[bool] = None
    pre_iconify_size: Optional[Dict[str, float]] = None


class ThingResponse(BaseModel):
    """Thing response model."""
    id: str
    canvas_id: str
    type: ThingType
    content: Dict[str, Any] = {}
    technical_metadata: Dict[str, Any] = {}
    custom_metadata: Dict[str, Any] = {}
    position_x: float
    position_y: float
    width: Optional[float]
    height: Optional[float]
    domain_id: Optional[str] = None
    summaries: Dict[str, Any] = {}
    title: Optional[str] = None
    color: Optional[str] = None
    z_index: float = 0.0
    collapsed: bool = False
    rag_status: str = "none"
    # Iconify feature fields
    iconified: bool = False
    pre_iconify_size: Optional[Dict[str, float]] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# =============================================================================
# Links
# =============================================================================

class LinkCreate(BaseModel):
    """Request to create a link between things."""
    source_id: str
    target_id: str
    type: str = "related" # Changed from LinkType enum to string
    label: str  # Mandatory
    description: str  # Mandatory
    # Optional target canvas ID for cross-canvas links
    target_canvas_id: Optional[str] = None
    # Optional fragment references for linking specific content selections
    source_fragment: Optional[Dict[str, Any]] = None
    target_fragment: Optional[Dict[str, Any]] = None


class LinkResponse(BaseModel):
    """Link response model."""
    id: str
    canvas_id: str
    source_id: str
    target_id: str
    type: str # Changed from LinkType enum to string
    label: Optional[str]
    description: Optional[str] = None
    target_canvas_id: Optional[str] = None
    target_thing_title: Optional[str] = None
    target_canvas_name: Optional[str] = None
    source_fragment: Optional[Dict[str, Any]] = None
    target_fragment: Optional[Dict[str, Any]] = None
    created_at: datetime

    class Config:
        from_attributes = True


class LinkUpdate(BaseModel):
    """Request to update a link."""
    type: Optional[str] = None
    label: Optional[str] = None
    description: Optional[str] = None
    source_fragment: Optional[Dict[str, Any]] = None
    target_fragment: Optional[Dict[str, Any]] = None


# =============================================================================
# Domains
# =============================================================================


class DomainCreate(BaseModel):
    """Request to create a domain."""
    name: str
    description: str  # Mandatory as per user request
    color: str = "#6366f1"
    z_index: float = -1.0
    position: Position = Field(default_factory=Position)
    parent_id: Optional[str] = None
    
    # Scenario Support
    type: Optional[str] = None
    visual_config: Optional[Dict[str, Any]] = None
    metadata_schema: Optional[Union[List[Dict[str, Any]], Dict[str, Any]]] = None
    metadata_values: Optional[Dict[str, Any]] = None
    drop_zones: Optional[Union[List[Dict[str, Any]], Dict[str, Any]]] = None


class DomainUpdate(BaseModel):
    """Request to update a domain."""
    name: Optional[str] = None
    description: Optional[str] = None
    color: Optional[str] = None
    z_index: Optional[float] = None
    position: Optional[Position] = None
    parent_id: Optional[str] = None
    width: Optional[float] = None
    height: Optional[float] = None
    
    # Scenario Support
    visual_config: Optional[Dict[str, Any]] = None
    metadata_schema: Optional[Union[List[Dict[str, Any]], Dict[str, Any]]] = None
    metadata_values: Optional[Dict[str, Any]] = None
    drop_zones: Optional[Union[List[Dict[str, Any]], Dict[str, Any]]] = None


class DomainResponse(BaseModel):
    """Domain response model."""
    id: str
    canvas_id: str
    parent_id: Optional[str]
    name: str
    description: Optional[str]
    color: str
    z_index: float
    position_x: float
    position_y: float
    width: float
    height: float
    
    # Scenario Support
    type: Optional[str] = None
    visual_config: Optional[Dict[str, Any]] = None
    metadata_schema: Optional[Union[List[Dict[str, Any]], Dict[str, Any]]] = None
    metadata_values: Optional[Dict[str, Any]] = None
    drop_zones: Optional[Union[List[Dict[str, Any]], Dict[str, Any]]] = None

    created_at: datetime
    updated_at: Optional[datetime]

    class Config:
        from_attributes = True


# =============================================================================
# Summarization
# =============================================================================

class SummarizeRequest(BaseModel):
    """Request to generate summaries for a thing."""
    thing_id: str
    kb_ids: List[str] = []


class SummarizeResponse(BaseModel):
    """Response with generated summaries."""
    thing_id: str
    summaries: Dict[str, Any]  # zoom_level -> summary


# =============================================================================
# Selection Analysis (LLM Actions)
# =============================================================================

class AnalyzeAction(str, Enum):
    """Types of analysis actions on selections."""
    SUMMARIZE = "summarize"
    EXPLAIN = "explain"
    EXTRACT_POINTS = "extract_points"
    ASK = "ask"
    IDENTIFY_PURPOSE = "identify_purpose"


class BatchAnalyzeRequest(BaseModel):
    """Request to analyze multiple things at once."""
    thing_ids: List[str]
    action: AnalyzeAction
    custom_prompt: Optional[str] = None
    model: Optional[str] = None
    kb_ids: List[str] = []


class FragmentData(BaseModel):
    """Fragment representing a selection within content."""
    type: str  # text, cell, region, message
    id: Optional[str] = None
    content: Optional[str] = None
    # Text fragments
    start_offset: Optional[int] = None
    end_offset: Optional[int] = None
    page_number: Optional[int] = None
    # Cell fragments
    sheet: Optional[str] = None
    range: Optional[str] = None
    values: Optional[List[List[Any]]] = None
    # Region fragments
    x: Optional[float] = None
    y: Optional[float] = None
    width: Optional[float] = None
    height: Optional[float] = None
    # Message fragments
    message_id: Optional[str] = None
    # Archimate fragments
    nodeId: Optional[str] = None
    nodeName: Optional[str] = None
    nodeType: Optional[str] = None

    class Config:
        extra = "allow"


class AnalyzeRequest(BaseModel):
    """Request to analyze selected content with LLM."""
    thing_id: str
    fragment: FragmentData
    action: AnalyzeAction
    model: Optional[str] = None
    custom_prompt: Optional[str] = None  # For "ask" action
    image_data: Optional[str] = None  # Base64 image data for vision analysis
    kb_ids: List[str] = []


class AnalyzeResponse(BaseModel):
    """Response from LLM analysis."""
    thing_id: str
    action: AnalyzeAction
    result: str
    # Option to create as new thing
    created_thing_id: Optional[str] = None


# Update forward references
CanvasWithContents.model_rebuild()


# =============================================================================
# Discover Links (Semantic Analysis)
# =============================================================================

class DiscoverLinksRequest(BaseModel):
    """Request to semantic discovery of links between selected items."""
    thing_ids: List[str] = []
    domain_ids: List[str] = []
    model: Optional[str] = None


class DiscoveredLinkDetail(BaseModel):
    """Details of a discovered link."""
    source_id: str
    target_id: str
    type: str 
    label: str
    description: Optional[str] = None



class DiscoverLinksResponse(BaseModel):
    """Response for link discovery."""
    links_created: int
    domains_updated: int
    details: List[DiscoveredLinkDetail]


# =============================================================================
# Smart Analysis Execution
# =============================================================================

class ExecuteTemplateRequest(BaseModel):
    """Request to execute a smart analysis template on selected items."""
    template_id: str
    canvas_id: str
    thing_ids: List[str] = []
    domain_ids: List[str] = []
    model: Optional[str] = None
    level_of_detail: Optional[str] = "medium" # low, medium, high
    source_fragment: Optional[FragmentData] = None
    user_id: Optional[int] = None # Added for tracking execution owner
    kb_ids: List[str] = []

class ExecuteTemplateResponse(BaseModel):
    """Response for template execution start."""
    execution_id: str
    status: str
    message: str



# =============================================================================
# Bulk Operations
# =============================================================================

class BatchDeleteRequest(BaseModel):
    """Request to batch delete things and domains."""
    thing_ids: List[str] = []
    domain_ids: List[str] = []


# =============================================================================
# Visualizer Schemas
# =============================================================================

class VisualPayload(BaseModel):
    structure_type: str = Field(..., description="Type of structure: 'chart', 'mermaid', 'markdown', 'react_component'")
    content: Dict[str, Any] = Field(..., description="The content payload. For charts, this is the props/data object.")

class VisualizerOutput(BaseModel):
    """Schema for Visualizer Agent Output."""
    visualizer_output: Dict[str, VisualPayload] = Field(..., description="Wrapper for visual analysis result.")
