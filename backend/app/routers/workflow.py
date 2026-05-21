"""
Workflow Router

API endpoints for designing workflow templates, starting executions,
submitting human approvals (User Tasks), monitoring logs, and subscribing
to real-time SSE streams.
Adheres strictly to PEP 8 standards and repository styles.
"""

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from typing import List, Dict, Any, Optional
from pydantic import BaseModel

from app.core.database import get_db
from app.core.security import decode_access_token
from app.routers.auth import get_current_active_user
from app.models.user import User
from app.models.workflow import WorkflowTemplate, WorkflowInstance, WorkflowExecutionLog
from app.schemas.workflow import (
    WorkflowTemplateCreate,
    WorkflowTemplateResponse,
    WorkflowInstanceCreate,
    WorkflowInstanceResponse,
    WorkflowInstanceResume
)
from app.services.workflow_service import workflow_service


router = APIRouter()


# =============================================================================
# Legacy / Backward Compatibility Endpoints
# =============================================================================

class LegacyWorkflowDefinition(BaseModel):
    nodes: list
    edges: list

class LegacyWorkflowExecutionRequest(BaseModel):
    workflow_id: Optional[str] = None
    workflow_def: Optional[LegacyWorkflowDefinition] = None
    input: str

@router.post("/workflow/execute")
async def legacy_execute_workflow(request: LegacyWorkflowExecutionRequest):
    """Legacy endpoint for backward compatibility."""
    result = await workflow_service.start_workflow(
        template_id=request.workflow_id or "legacy_template",
        canvas_id="legacy_canvas",
        initial_payload={"input": request.input}
    )
    return result

@router.post("/workflow/save/{workflow_id}")
async def legacy_save_workflow(workflow_id: str, workflow_def: LegacyWorkflowDefinition):
    """Legacy save endpoint."""
    return {"status": "saved", "id": workflow_id}


# =============================================================================
# Production Workflow Template Endpoints
# =============================================================================

@router.post("/workflows/templates", response_model=WorkflowTemplateResponse)
async def create_workflow_template(
    payload: WorkflowTemplateCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Creates a new workflow visual model (Simplified BPMN schema).
    """
    template = WorkflowTemplate(
        name=payload.name,
        description=payload.description,
        bpmn_json=payload.bpmn_json,
        created_by=current_user.id
    )
    db.add(template)
    db.commit()
    db.refresh(template)
    return template


@router.get("/workflows/templates", response_model=List[WorkflowTemplateResponse])
async def list_workflow_templates(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Lists all workflow templates.
    """
    templates = db.query(WorkflowTemplate).order_by(WorkflowTemplate.created_at.desc()).all()
    return templates


@router.get("/workflows/templates/{id}", response_model=WorkflowTemplateResponse)
async def get_workflow_template(
    id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Retrieves the full BPMN JSON definition of a workflow template.
    """
    template = db.query(WorkflowTemplate).filter(WorkflowTemplate.id == id).first()
    if not template:
        raise HTTPException(status_code=404, detail="Workflow template not found")
    return template


@router.delete("/workflows/templates/{id}", status_code=204)
async def delete_workflow_template(
    id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Deletes a workflow template.
    """
    template = db.query(WorkflowTemplate).filter(WorkflowTemplate.id == id).first()
    if not template:
        raise HTTPException(status_code=404, detail="Workflow template not found")
        
    db.delete(template)
    db.commit()
    return None


# =============================================================================
# Production Workflow Runtime Instance Endpoints
# =============================================================================

@router.post("/workflows/instances/start", response_model=WorkflowInstanceResponse)
async def start_workflow_instance(
    payload: WorkflowInstanceCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Instantiates and starts execution of a workflow template on a specific canvas.
    """
    # Verify template exists
    template = db.query(WorkflowTemplate).filter(WorkflowTemplate.id == payload.template_id).first()
    if not template:
        raise HTTPException(status_code=404, detail="Workflow template not found")
        
    try:
        initial_payload = payload.initial_payload or {}
        # Auto-bind standard tracking variables
        initial_payload["_user_id"] = current_user.id
        initial_payload["_user_email"] = current_user.email
        
        result = await workflow_service.start_workflow(
            template_id=payload.template_id,
            canvas_id=payload.canvas_id,
            initial_payload=initial_payload,
            is_debug=payload.is_debug
        )
        
        instance = db.query(WorkflowInstance).filter(WorkflowInstance.id == result["id"]).first()
        return instance
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to start workflow: {str(e)}")


@router.post("/workflows/instances/{id}/resume", response_model=WorkflowInstanceResponse)
async def resume_workflow_instance(
    id: str,
    payload: WorkflowInstanceResume,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Resumes a paused human-in-the-loop task checkpoint.
    Performs a strict Lane-based RBAC verification check before accepting the form input data.
    """
    try:
        result = await workflow_service.resume_workflow(
            instance_id=id,
            user=current_user,
            form_data=payload.form_data
        )
        instance = db.query(WorkflowInstance).filter(WorkflowInstance.id == id).first()
        return instance
    except HTTPException as http_err:
        raise http_err
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to resume workflow: {str(e)}")


@router.post("/workflows/instances/{id}/abort", response_model=WorkflowInstanceResponse)
async def abort_workflow_instance(
    id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Prematurely terminates active thread execution of a workflow instance.
    """
    try:
        result = await workflow_service.abort_workflow(instance_id=id)
        instance = db.query(WorkflowInstance).filter(WorkflowInstance.id == id).first()
        return instance
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/workflows/instances/{id}/status")
async def get_workflow_instance_status(
    id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Retrieves the execution status, current active nodes, and the completed timeline logs.
    """
    instance = db.query(WorkflowInstance).filter(WorkflowInstance.id == id).first()
    if not instance:
        raise HTTPException(status_code=404, detail="Workflow instance not found")
        
    logs = db.query(WorkflowExecutionLog).filter(
        WorkflowExecutionLog.instance_id == id
    ).order_by(WorkflowExecutionLog.timestamp.asc()).all()
    
    return {
        "id": instance.id,
        "template_id": instance.template_id,
        "canvas_id": instance.canvas_id,
        "status": instance.status,
        "current_node_ids": instance.current_node_ids,
        "state_payload": instance.state_payload,
        "created_at": instance.created_at,
        "updated_at": instance.updated_at,
        "logs": [
            {
                "id": log.id,
                "node_id": log.node_id,
                "action_type": log.action_type,
                "executed_by": log.executed_by,
                "timestamp": log.timestamp,
                "result_data": log.result_data
            } for log in logs
        ]
    }

async def get_current_user_from_token(token: str = Query(...), db: Session = Depends(get_db)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials"
    )
    payload = decode_access_token(token)
    if payload is None:
        raise credentials_exception
    email: str = payload.get("sub")
    if email is None:
        raise credentials_exception
    user = db.query(User).filter(User.email == email).first()
    if user is None or not user.is_active:
        raise credentials_exception
    return user

@router.get("/workflows/instances/{id}/stream")
async def stream_workflow_instance_execution(
    id: str,
    current_user: User = Depends(get_current_user_from_token)
):
    """
    Subscribes to the live execution server-sent events stream (SSE).
    Triggers path progressions, real-time status updates, and updates the canvas minilogs.
    """
    return StreamingResponse(
        workflow_service.stream_workflow_execution(instance_id=id),
        media_type="text/event-stream"
    )
