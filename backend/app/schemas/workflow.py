"""
Workflow Schemas

Pydantic schemas for workflow template modeling, runtime instantiation,
state logs, and Lane-based RBAC verification checks.
PEP 8 Compliant.
"""

from datetime import datetime
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field
from enum import Enum


class WorkflowStatus(str, Enum):
    """Runtime execution status of a workflow instance."""
    IDLE = "IDLE"
    RUNNING = "RUNNING"
    WAITING = "WAITING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"


# =============================================================================
# Workflow Template Schemas
# =============================================================================

class WorkflowTemplateBase(BaseModel):
    """Base template attributes."""
    name: str = Field(..., max_length=255, description="Name of the workflow template")
    description: Optional[str] = Field(None, max_length=1000, description="Detailed description")
    bpmn_json: Dict[str, Any] = Field(default_factory=dict, description="Complete visual BPMN topology schema")


class WorkflowTemplateCreate(WorkflowTemplateBase):
    """Request payload to create a new workflow template."""
    pass


class WorkflowTemplateUpdate(BaseModel):
    """Request payload to update an existing workflow template."""
    name: Optional[str] = Field(None, max_length=255)
    description: Optional[str] = Field(None, max_length=1000)
    bpmn_json: Optional[Dict[str, Any]] = None


class WorkflowTemplateResponse(WorkflowTemplateBase):
    """Response payload for workflow templates."""
    id: str
    created_by: Optional[int] = None
    created_at: datetime
    last_modified: datetime

    class Config:
        from_attributes = True


# =============================================================================
# Workflow Instance Schemas
# =============================================================================

class WorkflowInstanceCreate(BaseModel):
    """Request payload to start/instantiate a workflow template."""
    template_id: str = Field(..., description="ID of the workflow template blueprint")
    canvas_id: str = Field(..., description="Target Canvas location")
    initial_payload: Dict[str, Any] = Field(default_factory=dict, description="Initial parameters / document IDs")
    is_debug: bool = Field(False, description="If true, pause at every single node for step-by-step testing")


class WorkflowInstanceResume(BaseModel):
    """Request payload to resume a paused user task breakpoint."""
    form_data: Dict[str, Any] = Field(..., description="Inputted form tool data to merge into graph state")


class WorkflowInstanceResponse(BaseModel):
    """Response payload representing a runtime workflow instance."""
    id: str
    template_id: str
    canvas_id: str
    status: WorkflowStatus
    current_node_ids: List[str] = []
    state_payload: Dict[str, Any] = {}
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# =============================================================================
# Workflow Execution Log Schemas
# =============================================================================

class WorkflowExecutionLogResponse(BaseModel):
    """Response payload representing audit log steps of a workflow's history."""
    id: int
    instance_id: str
    node_id: str
    action_type: str
    executed_by: Optional[str] = None
    timestamp: datetime
    result_data: Optional[Dict[str, Any]] = None

    class Config:
        from_attributes = True
