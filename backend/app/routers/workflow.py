from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Dict, Any, Optional
from app.services.workflow_service import workflow_service

router = APIRouter()

class WorkflowDefinition(BaseModel):
    nodes: list
    edges: list

class WorkflowExecutionRequest(BaseModel):
    workflow_id: Optional[str] = None
    workflow_def: Optional[WorkflowDefinition] = None
    input: str

@router.post("/workflow/execute")
async def execute_workflow(request: WorkflowExecutionRequest):
    if request.workflow_id:
        # Load workflow from storage
        pass
    
    result = await workflow_service.execute_workflow(
        request.workflow_def.dict() if request.workflow_def else {}, 
        request.input
    )
    return result

@router.post("/workflow/save/{workflow_id}")
async def save_workflow(workflow_id: str, workflow_def: WorkflowDefinition):
    return workflow_service.save_workflow(workflow_id, workflow_def.dict())
