"""
Semantic Canvas Schemas

Pydantic schemas for canvas API requests and responses.

PEP 8 Compliant
"""
from datetime import datetime
from typing import Optional, List, Dict, Any
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
    URL = "url"


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


# =============================================================================
# Canvas
# =============================================================================

class ViewportState(BaseModel):
    """Canvas viewport state for pan/zoom."""
    x: float = 0.0
    y: float = 0.0
    zoom: float = 1.0


class CanvasCreate(BaseModel):
    """Request to create a new canvas."""
    name: str = "My Canvas"
    description: Optional[str] = None


class CanvasUpdate(BaseModel):
    """Request to update a canvas."""
    name: Optional[str] = None
    description: Optional[str] = None
    viewport: Optional[ViewportState] = None


class CanvasResponse(BaseModel):
    """Canvas response model."""
    id: str
    owner_id: int
    name: str
    description: Optional[str]
    viewport: ViewportState
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


class ThingCreate(BaseModel):
    """Request to create a thing on the canvas."""
    type: ThingType
    content: Dict[str, Any] = Field(default_factory=dict)
    position: Position = Field(default_factory=Position)
    size: Optional[Size] = None
    domain_id: Optional[str] = None
    title: Optional[str] = None


class ThingUpdate(BaseModel):
    """Request to update a thing."""
    content: Optional[Dict[str, Any]] = None
    position: Optional[Position] = None
    size: Optional[Size] = None
    domain_id: Optional[str] = None
    title: Optional[str] = None
    collapsed: Optional[bool] = None
    # Iconify feature fields
    iconified: Optional[bool] = None
    pre_iconify_size: Optional[Dict[str, float]] = None


class ThingResponse(BaseModel):
    """Thing response model."""
    id: str
    canvas_id: str
    type: ThingType
    content: Dict[str, Any]
    position_x: float
    position_y: float
    width: Optional[float]
    height: Optional[float]
    domain_id: Optional[str]
    summaries: Dict[str, str]
    title: Optional[str]
    collapsed: bool
    # Iconify feature fields
    iconified: bool = False
    pre_iconify_size: Optional[Dict[str, float]] = None
    created_at: datetime
    updated_at: Optional[datetime]

    class Config:
        from_attributes = True


# =============================================================================
# Links
# =============================================================================

class LinkCreate(BaseModel):
    """Request to create a link between things."""
    source_id: str
    target_id: str
    type: LinkType = LinkType.RELATED
    label: Optional[str] = None
    # Optional fragment references for linking specific content selections
    source_fragment: Optional[Dict[str, Any]] = None
    target_fragment: Optional[Dict[str, Any]] = None


class LinkResponse(BaseModel):
    """Link response model."""
    id: str
    canvas_id: str
    source_id: str
    target_id: str
    type: LinkType
    label: Optional[str]
    source_fragment: Optional[Dict[str, Any]] = None
    target_fragment: Optional[Dict[str, Any]] = None
    created_at: datetime

    class Config:
        from_attributes = True


class LinkUpdate(BaseModel):
    """Request to update a link."""
    type: Optional[LinkType] = None
    label: Optional[str] = None
    source_fragment: Optional[Dict[str, Any]] = None
    target_fragment: Optional[Dict[str, Any]] = None


# =============================================================================
# Domains
# =============================================================================

class DomainCreate(BaseModel):
    """Request to create a domain."""
    name: str
    color: str = "#6366f1"
    position: Position = Field(default_factory=Position)
    parent_id: Optional[str] = None


class DomainUpdate(BaseModel):
    """Request to update a domain."""
    name: Optional[str] = None
    color: Optional[str] = None
    position: Optional[Position] = None
    parent_id: Optional[str] = None
    width: Optional[float] = None
    height: Optional[float] = None


class DomainResponse(BaseModel):
    """Domain response model."""
    id: str
    canvas_id: str
    parent_id: Optional[str]
    name: str
    color: str
    position_x: float
    position_y: float
    width: float
    height: float
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


class SummarizeResponse(BaseModel):
    """Response with generated summaries."""
    thing_id: str
    summaries: Dict[str, str]  # zoom_level -> summary


# =============================================================================
# Selection Analysis (LLM Actions)
# =============================================================================

class AnalyzeAction(str, Enum):
    """Types of analysis actions on selections."""
    SUMMARIZE = "summarize"
    EXPLAIN = "explain"
    EXTRACT_POINTS = "extract_points"
    ASK = "ask"


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
    # Region fragments
    x: Optional[float] = None
    y: Optional[float] = None
    width: Optional[float] = None
    height: Optional[float] = None
    # Message fragments
    message_id: Optional[str] = None


class AnalyzeRequest(BaseModel):
    """Request to analyze selected content with LLM."""
    thing_id: str
    fragment: FragmentData
    action: AnalyzeAction
    model: Optional[str] = None
    custom_prompt: Optional[str] = None  # For "ask" action
    image_data: Optional[str] = None  # Base64 image data for vision analysis


class AnalyzeResponse(BaseModel):
    """Response from LLM analysis."""
    thing_id: str
    action: AnalyzeAction
    result: str
    # Option to create as new thing
    created_thing_id: Optional[str] = None


# Update forward references
CanvasWithContents.model_rebuild()
