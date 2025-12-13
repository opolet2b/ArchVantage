"""
Agent Blueprint Models

SQLAlchemy models for storing Agent Blueprints used by the
Low-Code AI Agent Builder. These models support the JSON Blueprint
schema defined in the AgentBuilder-Concept.md specification.
"""
from sqlalchemy import (
    Boolean, Column, ForeignKey, Integer, String, 
    DateTime, Enum, JSON, Text, Float
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import enum
from app.core.database import Base


class PrimitiveType(str, enum.Enum):
    """Standard primitive types that agents can use."""
    HTTP_REQUEST = "HTTP_REQUEST"
    CALL_TOOL = "CALL_TOOL"
    CONDITION = "CONDITION"
    JSON_MAPPING = "JSON_MAPPING"
    TEXT_TEMPLATE = "TEXT_TEMPLATE"
    FOREACH = "FOREACH"
    LLM_DECISION = "LLM_DECISION"


class AgentBlueprint(Base):
    """
    Main blueprint model storing the complete agent definition.
    
    The graph field stores the full node/edge structure as JSON,
    following the DSL schema from the specification.
    """
    __tablename__ = "agent_blueprints"

    id = Column(String, primary_key=True, index=True)
    name = Column(String, index=True, nullable=False)
    description = Column(Text, nullable=True)
    version = Column(String, default="1.0")
    
    # The complete graph definition (nodes + edges)
    graph = Column(JSON, default={"nodes": [], "edges": []})
    
    # Schema for required input variables
    inputs_schema = Column(JSON, default={})
    
    # List of required secret keys (e.g., ["STRIPE_KEY", "OPENAI_KEY"])
    secrets_requirements = Column(JSON, default=[])
    
    # Ownership and access control
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    is_published = Column(Boolean, default=False)
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    owner = relationship("app.models.user.User")
    nodes = relationship(
        "AgentNode", 
        back_populates="blueprint", 
        cascade="all, delete-orphan"
    )
    edges = relationship(
        "AgentEdge", 
        back_populates="blueprint", 
        cascade="all, delete-orphan"
    )
    secrets = relationship(
        "AgentSecret", 
        back_populates="blueprint", 
        cascade="all, delete-orphan"
    )
    executions = relationship(
        "AgentExecution", 
        back_populates="blueprint", 
        cascade="all, delete-orphan"
    )


class AgentNode(Base):
    """
    Individual node in an agent's graph.
    
    Denormalized from the JSON graph for easier querying and 
    validation. Each node has a type (primitive) and parameters.
    """
    __tablename__ = "agent_nodes"

    id = Column(String, primary_key=True, index=True)
    blueprint_id = Column(
        String, 
        ForeignKey("agent_blueprints.id", ondelete="CASCADE"), 
        nullable=False
    )
    
    # Primitive type (HTTP_REQUEST, CALL_TOOL, etc.)
    type = Column(Enum(PrimitiveType), nullable=False)
    
    # Display metadata
    label = Column(String, nullable=True)
    ui_position_x = Column(Float, default=0)
    ui_position_y = Column(Float, default=0)
    
    # Primitive-specific parameters
    params = Column(JSON, default={})

    # Relationship
    blueprint = relationship("AgentBlueprint", back_populates="nodes")


class AgentEdge(Base):
    """
    Edge connecting two nodes in an agent's graph.
    
    Supports conditional branching via the optional condition field.
    """
    __tablename__ = "agent_edges"

    id = Column(String, primary_key=True, index=True)
    blueprint_id = Column(
        String, 
        ForeignKey("agent_blueprints.id", ondelete="CASCADE"), 
        nullable=False
    )
    
    # Source and target node IDs
    source_node_id = Column(String, nullable=False)
    target_node_id = Column(String, nullable=False)
    
    # Optional condition for branching (evaluated at runtime)
    condition = Column(String, nullable=True)

    # Relationship
    blueprint = relationship("AgentBlueprint", back_populates="edges")


class AgentSecret(Base):
    """
    Encrypted secret storage for agent blueprints.
    
    Secrets are injected at runtime via {{secrets.KEY_NAME}} syntax
    and are never exposed in API responses or the frontend.
    """
    __tablename__ = "agent_secrets"

    id = Column(Integer, primary_key=True, index=True)
    blueprint_id = Column(
        String, 
        ForeignKey("agent_blueprints.id", ondelete="CASCADE"), 
        nullable=False
    )
    
    # Secret key name (e.g., "STRIPE_KEY")
    key_name = Column(String, nullable=False)
    
    # AES-256 encrypted value
    encrypted_value = Column(Text, nullable=False)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationship
    blueprint = relationship("AgentBlueprint", back_populates="secrets")


class AgentExecution(Base):
    """
    Execution log for agent runs.
    
    Tracks inputs, outputs, status, and timing for each execution.
    """
    __tablename__ = "agent_executions"

    id = Column(Integer, primary_key=True, index=True)
    blueprint_id = Column(
        String, 
        ForeignKey("agent_blueprints.id", ondelete="CASCADE"), 
        nullable=False
    )
    
    # Who triggered this execution
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    
    # Execution data
    inputs = Column(JSON, default={})
    outputs = Column(JSON, default={})
    status = Column(String, default="pending")  # pending, running, completed, failed
    error_message = Column(Text, nullable=True)
    
    # Timestamps
    started_at = Column(DateTime(timezone=True), server_default=func.now())
    completed_at = Column(DateTime(timezone=True), nullable=True)

    # Relationships
    blueprint = relationship("AgentBlueprint", back_populates="executions")
    user = relationship("app.models.user.User")
