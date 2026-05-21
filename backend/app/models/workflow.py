"""
Workflow Models

Database models for modeling, running, and tracking BPMN-like processes.
Adheres to PEP 8 coding standards and repository structures.
"""

import enum
from uuid import uuid4
from sqlalchemy import Column, String, Integer, DateTime, ForeignKey, JSON, Boolean, Enum as SQLEnum
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base


class WorkflowStatus(str, enum.Enum):
    """Execution status of a workflow instance."""
    IDLE = "IDLE"
    RUNNING = "RUNNING"
    WAITING = "WAITING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"


class WorkflowTemplate(Base):
    """
    Blueprint representing a modeled BPMN workflow configuration.
    
    Stored in JSON topology format (lanes, custom nodes, edges).
    """
    __tablename__ = "workflow_templates"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid4()))
    name = Column(String(255), nullable=False)
    description = Column(String(1000), nullable=True)
    
    # Store complete BPMN configuration (JSON topology with lanes, nodes, connections, and metadata)
    bpmn_json = Column(JSON, nullable=False, default={})
    
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    last_modified = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships
    creator = relationship("User", foreign_keys=[created_by])
    instances = relationship("WorkflowInstance", back_populates="template", cascade="all, delete-orphan")


class WorkflowInstance(Base):
    """
    Runtime execution state of a specific workflow template.
    
    Tracks state payload and active concurrent graph breakpoints.
    """
    __tablename__ = "workflow_instances"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid4()))
    template_id = Column(String(36), ForeignKey("workflow_templates.id", ondelete="CASCADE"), nullable=False)
    canvas_id = Column(String(36), ForeignKey("canvases.id", ondelete="CASCADE"), nullable=False)
    
    status = Column(SQLEnum(WorkflowStatus), default=WorkflowStatus.IDLE, nullable=False)
    
    # Track parallel execution states (JSON Array of strings, e.g. ["task_node_1", "task_node_2"])
    current_node_ids = Column(JSON, default=[], nullable=False)
    
    # State payload carrying document refs, agent findings, form data
    state_payload = Column(JSON, default={}, nullable=False)
    
    is_debug = Column(Boolean, default=False, nullable=False)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    template = relationship("WorkflowTemplate", back_populates="instances")
    canvas = relationship("Canvas")
    logs = relationship("WorkflowExecutionLog", back_populates="instance", cascade="all, delete-orphan")


class WorkflowExecutionLog(Base):
    """
    Audit log record of actions executed within a workflow.
    
    Tracks gateway branching decisions, human validations, and errors.
    """
    __tablename__ = "workflow_execution_logs"

    id = Column(Integer, primary_key=True, index=True)
    instance_id = Column(String(36), ForeignKey("workflow_instances.id", ondelete="CASCADE"), nullable=False)
    node_id = Column(String(100), nullable=False)
    
    # e.g., "ENTER_NODE", "EXIT_NODE", "PAUSE_BREAKPOINT", "RESUME_NODE", "ERROR"
    action_type = Column(String(50), nullable=False)
    
    # Tracks who performed the action (User ID for human tasks, or 'system' for Agents)
    executed_by = Column(String(255), nullable=True)
    
    timestamp = Column(DateTime(timezone=True), server_default=func.now())
    
    # Stores action-specific results, output notes, error traces
    result_data = Column(JSON, nullable=True)

    # Relationships
    instance = relationship("WorkflowInstance", back_populates="logs")
