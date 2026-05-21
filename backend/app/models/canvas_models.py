"""
Semantic Canvas Models

SQLAlchemy models for the semantic canvas feature that transforms
the chat interface into a spatial knowledge canvas.

PEP 8 Compliant
"""
import uuid
from datetime import datetime
from enum import Enum
from sqlalchemy import (
    Column, String, Integer, Float, Boolean, DateTime,
    ForeignKey, JSON, Text, Enum as SQLEnum, Table
)
from sqlalchemy.orm import relationship

from app.core.database import Base


def generate_uuid():
    """Generate a UUID string for use as primary key."""
    return str(uuid.uuid4())


# Association model for Canvas-User (allowed users) with permission levels
class CanvasUser(Base):
    __tablename__ = "canvas_users_association"
    canvas_id = Column(String(36), ForeignKey("canvases.id"), primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), primary_key=True)
    permission_level = Column(String(20), default="read") # "read" or "write"

# Association model for Canvas-Role (allowed roles) with permission levels
class CanvasRole(Base):
    __tablename__ = "canvas_roles_association"
    canvas_id = Column(String(36), ForeignKey("canvases.id"), primary_key=True)
    role_id = Column(Integer, ForeignKey("roles.id"), primary_key=True)
    permission_level = Column(String(20), default="read") # "read" or "write"



class ThingType(str, Enum):
    """
    Types of things that can exist on the canvas.
    """
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


class RAGStatus(str, Enum):
    """Status of RAG vectorization for a thing."""
    NONE = "none"
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


class LinkType(str, Enum):
    """
    Types of relationships between things.
    
    Standard types are listed here, but Scenarios can define custom string types.
    """
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


class Canvas(Base):
    """
    A semantic canvas - an infinite spatial workspace.
    
    Each user can have multiple canvases, each containing
    things that can be linked and grouped into domains.
    """
    __tablename__ = "canvases"

    id = Column(
        String(36),
        primary_key=True,
        default=generate_uuid
    )
    owner_id = Column(
        Integer,
        ForeignKey("users.id"),
        nullable=False
    )
    name = Column(String(255), nullable=False, default="My Canvas")
    description = Column(Text, nullable=True)
    
    # Viewport state for resuming where user left off
    # Format: {"x": float, "y": float, "zoom": float}
    viewport = Column(JSON, default={"x": 0, "y": 0, "zoom": 1.0})
    
    # Sort Order
    position = Column(Integer, default=0, nullable=False)

    # Store arbitrary owner settings for this canvas (e.g. tool colors)
    owner_config = Column(JSON, nullable=True)
    
    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, onupdate=datetime.utcnow)
    
    # Archiving
    is_archived = Column(Boolean, default=False)
    
    # Relationships
    things = relationship(
        "CanvasThing",
        back_populates="canvas",
        cascade="all, delete-orphan"
    )
    domains = relationship(
        "Domain",
        back_populates="canvas",
        cascade="all, delete-orphan"
    )
    links = relationship(
        "CanvasLink",
        back_populates="canvas",
        cascade="all, delete-orphan"
    )


    # Permissions
    # Simple view-only collections for backward compatibility
    allowed_users = relationship(
        "User",
        secondary="canvas_users_association",
        backref="shared_canvases",
        viewonly=True
    )
    allowed_roles = relationship(
        "Role",
        secondary="canvas_roles_association",
        backref="shared_canvases",
        viewonly=True
    )

    # Detailed associations with levels
    user_permissions = relationship("CanvasUser", cascade="all, delete-orphan")
    role_permissions = relationship("CanvasRole", cascade="all, delete-orphan")

    # Analysis Space
    analysis_space_id = Column(
        String(36),
        ForeignKey("analysis_spaces.id"),
        nullable=True
    )
    analysis_space = relationship("AnalysisSpace", back_populates="canvases")

    @property
    def allowed_user_ids(self):
        return [u.id for u in self.allowed_users]

    @property
    def allowed_role_ids(self):
        return [r.id for r in self.allowed_roles]


class AnalysisSpace(Base):
    """
    An Analysis Space is a container for multiple canvases.
    It allows for grouping related analyses and visualizing them in 3D.
    """
    __tablename__ = "analysis_spaces"

    id = Column(
        String(36),
        primary_key=True,
        default=generate_uuid
    )
    owner_id = Column(
        Integer,
        ForeignKey("users.id"),
        nullable=False
    )
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    
    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, onupdate=datetime.utcnow)
    
    # Relationships
    canvases = relationship("Canvas", back_populates="analysis_space", order_by="Canvas.position")
    owner = relationship("User", backref="analysis_spaces")




class CanvasThing(Base):
    """
    A thing on the canvas - any content type that can be placed,
    moved, linked, and grouped.
    
    The 'content' field stores type-specific data as JSON.
    The 'summaries' field stores pre-computed AI summaries for
    different zoom levels.
    """
    __tablename__ = "canvas_things"

    id = Column(
        String(36),
        primary_key=True,
        default=generate_uuid
    )
    canvas_id = Column(
        String(36),
        ForeignKey("canvases.id"),
        nullable=False
    )
    
    # What type of thing is this?
    type = Column(SQLEnum(ThingType), nullable=False)
    
    # Type-specific content as JSON
    # Examples:
    #   text: {"text": "..."}
    #   conversation: {"conversation_id": "...", "messages": [...]}
    #   document: {"file_path": "...", "filename": "...", "content": "..."}
    #   image: {"file_path": "...", "alt_text": "..."}
    content = Column(JSON, nullable=False, default={})
    
    # TCMS Metadata Fields
    # Category 1: Technical Metadata (Immutable, System-generated)
    technical_metadata = Column(JSON, nullable=False, default={})
    
    # Category 2: Custom Metadata (User/Scenario-defined)
    custom_metadata = Column(JSON, nullable=False, default={})
    
    # Note: Category 3 (System/AI Metadata) is stored within 'content' as 'system_metadata'

    # Position on canvas
    position_x = Column(Float, nullable=False, default=0.0)
    position_y = Column(Float, nullable=False, default=0.0)
    
    # Size (optional - auto-calculated if not set)
    width = Column(Float, nullable=True)
    height = Column(Float, nullable=True)
    
    # Optional domain grouping
    domain_id = Column(
        String(36),
        ForeignKey("domains.id"),
        nullable=True
    )
    
    # Pre-computed summaries for different zoom levels
    # Format: {"label": "3-5 words", "one_line": "headline", "sentence": "nuanced", "paragraph": "2-3 sentences"}
    summaries = Column(JSON, default={})
    
    # Display settings
    title = Column(String(255), nullable=True)
    color = Column(String(20), nullable=True)  # Custom header color
    z_index = Column(Float, nullable=False, default=0.0) # Z-Order
    collapsed = Column(Boolean, default=False)

    # Iconify feature - reduce thing to icon representation
    # When iconified=True, thing displays as compact icon without content
    iconified = Column(Boolean, default=False)
    # Store original size before iconify for restoration
    # Format: {"width": float, "height": float}
    pre_iconify_size = Column(JSON, nullable=True)
    
    # RAG Status
    rag_status = Column(String, default="none")
    
    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, onupdate=datetime.utcnow)
    
    # Relationships
    canvas = relationship("Canvas", back_populates="things")
    domain = relationship("Domain", back_populates="things")

    # Links - Explicit relationship to handle cascade delete
    outgoing_links = relationship(
        "CanvasLink",
        primaryjoin="CanvasThing.id==foreign(CanvasLink.source_id)",
        back_populates="source",
        cascade="all, delete-orphan"
    )
    incoming_links = relationship(
        "CanvasLink",
        primaryjoin="CanvasThing.id==foreign(CanvasLink.target_id)",
        back_populates="target",
        cascade="all, delete-orphan"
    )


class CanvasLink(Base):
    """
    A link between two things on the canvas.
    
    Links are directional (source → target) and typed.
    """
    __tablename__ = "canvas_links"

    id = Column(
        String(36),
        primary_key=True,
        default=generate_uuid
    )
    canvas_id = Column(
        String(36),
        ForeignKey("canvases.id"),
        nullable=False
    )
    
    source_id = Column(
        String(36),
        nullable=False
    )
    target_id = Column(
        String(36),
        nullable=False
    )
    
    # Changed from Enum to String to support dynamic scenario link types
    type = Column(
        String(50), 
        nullable=False,
        default="related"
    )
    label = Column(String(255), nullable=True)
    description = Column(Text, nullable=True)

    # New Field for Unified Link Storage
    # If set, this link points to a node on a DIFFERENT canvas.
    target_canvas_id = Column(String(36), nullable=True)
    
    # Optional fragment references for linking specific content selections
    # Format matches FragmentData schema:
    # {"type": "text", "content": "...", "start_offset": 0, "end_offset": 100, ...}
    source_fragment = Column(JSON, nullable=True)
    target_fragment = Column(JSON, nullable=True)
    
    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationships
    canvas = relationship("Canvas", back_populates="links")
    source = relationship(
        "CanvasThing",
        primaryjoin="foreign(CanvasLink.source_id)==CanvasThing.id",
        back_populates="outgoing_links"
    )
    target = relationship(
        "CanvasThing",
        primaryjoin="foreign(CanvasLink.target_id)==CanvasThing.id",
        back_populates="incoming_links"
    )


class Domain(Base):
    """
    A domain is a container for grouping related things.
    
    Domains are like Figma frames - they visually group content
    and can be nested hierarchically.
    """
    __tablename__ = "domains"

    id = Column(
        String(36),
        primary_key=True,
        default=generate_uuid
    )
    canvas_id = Column(
        String(36),
        ForeignKey("canvases.id"),
        nullable=False
    )
    
    # Optional parent domain for nesting
    parent_id = Column(
        String(36),
        ForeignKey("domains.id"),
        nullable=True
    )
    
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    color = Column(String(7), default="#6366f1")  # Hex color
    z_index = Column(Float, nullable=False, default=-1.0) # Z-Order (-1 default to stay behind things)
    
    # Scenario Support
    type = Column(String(50), nullable=True) # ID of the domain definition in the scenario
    visual_config = Column(JSON, nullable=True) # Override/Cached visual styles
    metadata_schema = Column(JSON, nullable=True) # Enforced metadata schema
    metadata_values = Column(JSON, nullable=True) # Instance-specific metadata values
    drop_zones = Column(JSON, nullable=True) # Domain-specific drop zones configuration
    
    # Position and size (auto-calculated from children)
    position_x = Column(Float, default=0.0)
    position_y = Column(Float, default=0.0)
    width = Column(Float, default=300.0)
    height = Column(Float, default=200.0)
    
    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, onupdate=datetime.utcnow)
    
    # Relationships
    canvas = relationship("Canvas", back_populates="domains")
    things = relationship("CanvasThing", back_populates="domain")
    children = relationship(
        "Domain",
        backref="parent",
        remote_side=[id]
    )
