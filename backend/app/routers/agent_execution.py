"""
Agent Execution Router

API endpoints for executing Agent Blueprints.
Supports both synchronous and streaming execution.
"""
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from typing import Dict, Any, List
from datetime import datetime
import json
import asyncio
import traceback

from app.core.database import get_db
from app.schemas.agent_schemas import (
    BlueprintExecuteRequest, BlueprintExecuteResponse, ExecutionStatus
)
from app.models.agent_blueprint import AgentBlueprint, AgentExecution
from app.routers.auth import get_current_active_user
from app.models.user import User
from app.services.agent_runtime import AgentRuntime, execute_blueprint


router = APIRouter()


@router.post(
    "/agent-blueprints/{blueprint_id}/execute", 
    response_model=BlueprintExecuteResponse
)
async def execute_agent_blueprint(
    blueprint_id: str,
    request: BlueprintExecuteRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Execute an agent blueprint synchronously.
    
    Returns the complete execution result after all steps complete.
    """
    # Load blueprint
    blueprint = db.query(AgentBlueprint).filter(
        AgentBlueprint.id == blueprint_id
    ).first()
    
    if not blueprint:
        raise HTTPException(status_code=404, detail="Blueprint not found")
    
    # Check access
    if blueprint.owner_id != current_user.id and not blueprint.is_published:
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Validate inputs against schema
    inputs_schema = blueprint.inputs_schema or {}
    required = inputs_schema.get("required", [])
    for field in required:
        if field not in request.inputs:
            raise HTTPException(
                status_code=422,
                detail=f"Missing required input: {field}"
            )
    
    # Add user ID to inputs for tracking
    inputs = {**request.inputs, "_user_id": current_user.id}
    
    # Execute
    result = await execute_blueprint(db, blueprint_id, inputs)
    
    # Convert to response
    return BlueprintExecuteResponse(
        execution_id=result.get("execution_id", 0),
        status=ExecutionStatus(result.get("status", "failed")),
        outputs=result.get("outputs", {}),
        execution_state=result.get("execution_state", {}),
        steps=[],  # Simplified - full steps in stream mode
        error_message=result.get("error"),
        started_at=result.get("started_at"),
        completed_at=result.get("completed_at")
    )



@router.post(
    "/agent-blueprints/{blueprint_id}/execute/step", 
    response_model=BlueprintExecuteResponse
)
async def execute_agent_blueprint_step(
    blueprint_id: str,
    request: BlueprintExecuteRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Start step-by-step execution.
    Executes the first step (START node) and pauses.
    """
    # Load blueprint
    blueprint = db.query(AgentBlueprint).filter(
        AgentBlueprint.id == blueprint_id
    ).first()
    
    if not blueprint:
        raise HTTPException(status_code=404, detail="Blueprint not found")
    
    # Check access
    if blueprint.owner_id != current_user.id and not blueprint.is_published:
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Validate inputs against schema
    inputs_schema = blueprint.inputs_schema or {}
    required = inputs_schema.get("required", [])
    for field in required:
        if field not in request.inputs:
            raise HTTPException(
                status_code=422,
                detail=f"Missing required input: {field}"
            )
    
    # Add user ID to inputs for tracking
    inputs = {**request.inputs, "_user_id": current_user.id}
    
    # Execute with steps_limit=1
    result = await execute_blueprint(db, blueprint_id, inputs, steps_limit=1)
    
    # Convert to response
    return BlueprintExecuteResponse(
        execution_id=result.get("execution_id", 0),
        status=ExecutionStatus(result.get("status", "failed")),
        outputs=result.get("outputs", {}),
        execution_state=result.get("execution_state", {}),
        steps=result.get("steps", []),
        error_message=result.get("error"),
        started_at=result.get("started_at"),
        completed_at=result.get("completed_at"),
        gui_schema=result.get("gui_schema"),
        tool_name=result.get("tool_name"),
        description=result.get("description"),
        waiting_node=result.get("waiting_node")
    )


@router.post("/agent-blueprints/{blueprint_id}/execute/stream")
async def execute_agent_blueprint_stream(
    blueprint_id: str,
    request: BlueprintExecuteRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Execute an agent blueprint with streaming response.
    
    Returns execution steps as they complete (NDJSON format).
    """
    # Load blueprint
    blueprint = db.query(AgentBlueprint).filter(
        AgentBlueprint.id == blueprint_id
    ).first()
    
    if not blueprint:
        raise HTTPException(status_code=404, detail="Blueprint not found")
    
    # Check access
    if blueprint.owner_id != current_user.id and not blueprint.is_published:
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Add user ID to inputs
    inputs = {**request.inputs, "_user_id": current_user.id}
    
    async def event_generator():
        """Generate execution events as NDJSON."""
        # Send start event
        yield json.dumps({
            "type": "start",
            "blueprint_id": blueprint_id,
            "inputs": request.inputs
        }) + "\n"
        
        try:
            # Create runtime
            runtime = AgentRuntime(blueprint, db)
            
            # Execute and yield steps
            result = await runtime.execute(inputs)
            
            # Send step events
            for step in result.get("steps", []):
                yield json.dumps({
                    "type": "step",
                    **step
                }) + "\n"
                await asyncio.sleep(0.01)  # Small delay for streaming
            
            # Send completion event - include GUI fields for waiting_for_input
            completion_event = {
                "type": "complete",
                "status": result.get("status"),
                "outputs": result.get("outputs", {}),
                "execution_state": result.get("execution_state", {}),
                "error": result.get("error"),
                "duration_ms": result.get("duration_ms")
            }
            
            # Add GUI tool fields if waiting for input
            if result.get("status") == "waiting_for_input":
                completion_event["gui_schema"] = result.get("gui_schema", {})
                completion_event["tool_name"] = result.get("tool_name", "GUI Tool")
                completion_event["description"] = result.get("description", "")
                completion_event["waiting_node"] = result.get("waiting_node")
            
            yield json.dumps(completion_event) + "\n"
            
        except Exception as e:
            yield json.dumps({
                "type": "error",
                "message": str(e)
            }) + "\n"
    
    return StreamingResponse(
        event_generator(),
        media_type="application/x-ndjson"
    )


@router.get("/agent-blueprints/{blueprint_id}/executions")
async def list_executions(
    blueprint_id: str,
    skip: int = 0,
    limit: int = 50,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """List execution history for a blueprint."""
    blueprint = db.query(AgentBlueprint).filter(
        AgentBlueprint.id == blueprint_id
    ).first()
    
    if not blueprint:
        raise HTTPException(status_code=404, detail="Blueprint not found")
    
    # Check access
    if blueprint.owner_id != current_user.id and not blueprint.is_published:
        raise HTTPException(status_code=403, detail="Access denied")
    
    executions = db.query(AgentExecution).filter(
        AgentExecution.blueprint_id == blueprint_id
    ).order_by(AgentExecution.started_at.desc()).offset(skip).limit(limit).all()
    
    return [
        {
            "id": e.id,
            "status": e.status,
            "started_at": e.started_at.isoformat() if e.started_at else None,
            "completed_at": e.completed_at.isoformat() if e.completed_at else None,
            "error": e.error_message
        }
        for e in executions
    ]


@router.get("/agent-blueprints/{blueprint_id}/executions/{execution_id}")
async def get_execution(
    blueprint_id: str,
    execution_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Get details of a specific execution."""
    execution = db.query(AgentExecution).filter(
        AgentExecution.id == execution_id,
        AgentExecution.blueprint_id == blueprint_id
    ).first()
    
    if not execution:
        raise HTTPException(status_code=404, detail="Execution not found")
    
    # Check access via blueprint
    blueprint = db.query(AgentBlueprint).filter(
        AgentBlueprint.id == blueprint_id
    ).first()
    
    if blueprint.owner_id != current_user.id and not blueprint.is_published:
        raise HTTPException(status_code=403, detail="Access denied")
    
    return {
        "id": execution.id,
        "blueprint_id": execution.blueprint_id,
        "user_id": execution.user_id,
        "status": execution.status,
        "inputs": execution.inputs,
        "outputs": execution.outputs,
        "error_message": execution.error_message,
        "started_at": execution.started_at.isoformat() if execution.started_at else None,
        "completed_at": execution.completed_at.isoformat() if execution.completed_at else None
    }


@router.get("/executions/{execution_id}/next-node")
async def get_next_node(
    execution_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Query which node will execute next without actually executing it.
    Used for UI highlighting before execution starts.
    """
    execution = db.query(AgentExecution).filter(AgentExecution.id == execution_id).first()
    if not execution:
        raise HTTPException(status_code=404, detail="Execution not found")
    if execution.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Check if execution is in a resumable state
    if execution.status not in ["paused", "running", "waiting_for_input"]:
        return {"next_node_id": None, "reason": f"Execution in status {execution.status}"}
    
    # Get the next node from saved state
    state = execution.state or {}
    next_node_id = state.get("current_node")
    
    return {"next_node_id": next_node_id}


@router.post("/executions/{execution_id}/next", response_model=BlueprintExecuteResponse)
async def resume_execution_step(
    execution_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Resume execution for the next step."""
    execution = db.query(AgentExecution).filter(AgentExecution.id == execution_id).first()
    if not execution: raise HTTPException(status_code=404, detail="Execution not found")
    if execution.user_id != current_user.id: raise HTTPException(status_code=403, detail="Access denied")
    
    # Check status
    if execution.status not in ["paused", "running"]: # running allowed if resuming from crash?
        raise HTTPException(status_code=400, detail=f"Cannot resume execution in status {execution.status}")
    
    # Load blueprint for runtime
    blueprint = db.query(AgentBlueprint).filter(AgentBlueprint.id == execution.blueprint_id).first()
    runtime = AgentRuntime(blueprint, db)
    
    try:
        # Resume
        result = await runtime.execute(execution.inputs, initial_state=execution.state, steps_limit=1)
        
        # Update record
        execution.status = result["status"]
        execution.outputs = result.get("outputs", {})
        execution.error_message = result.get("error")
        execution.state = result.get("execution_state")
        if result["status"] in ["completed", "failed"]:
            execution.completed_at = datetime.utcnow()
        db.commit()
        
        result["execution_id"] = execution.id
        return BlueprintExecuteResponse(
            execution_id=result.get("execution_id", 0),
            status=ExecutionStatus(result.get("status", "failed")),
            outputs=result.get("outputs", {}),
            execution_state=result.get("execution_state", {}),
            steps=result.get("steps", []),
            error_message=result.get("error"),
            started_at=result.get("started_at"),
            completed_at=result.get("completed_at"),
            gui_schema=result.get("gui_schema"),
            tool_name=result.get("tool_name"),
            description=result.get("description"),
            waiting_node=result.get("waiting_node")
        )
    except Exception as e:
        execution.status = "failed"
        execution.error_message = str(e)
        execution.completed_at = datetime.utcnow()
        db.commit()
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/executions/{execution_id}/input", response_model=BlueprintExecuteResponse)
async def resume_execution_input(
    execution_id: int,
    request: BlueprintExecuteRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Resume execution with GUI input."""
    execution = db.query(AgentExecution).filter(AgentExecution.id == execution_id).first()
    if not execution: raise HTTPException(status_code=404, detail="Execution not found")
    if execution.user_id != current_user.id: raise HTTPException(status_code=403, detail="Access denied")
    
    if execution.status != "waiting_for_input":
        print(f"[EXECUTION] 400 ERROR: Execution {execution_id} status is '{execution.status}', expected 'waiting_for_input'")
        raise HTTPException(status_code=400, detail=f"Execution is not waiting for input (status: {execution.status})")
        
    blueprint = db.query(AgentBlueprint).filter(AgentBlueprint.id == execution.blueprint_id).first()
    runtime = AgentRuntime(blueprint, db)
    
    try:
        # Update state with input
        execution_state = execution.state or {}
        new_state = runtime.resume_with_input(execution_state, request.inputs)
        
        # Resume
        result = await runtime.execute(execution.inputs, initial_state=new_state, steps_limit=1)
        
        # Update record
        execution.status = result["status"]
        execution.outputs = result.get("outputs", {})
        execution.error_message = result.get("error")
        execution.state = result.get("execution_state")
        if result["status"] in ["completed", "failed"]:
            execution.completed_at = datetime.utcnow()
        db.commit()
        
        result["execution_id"] = execution.id
        return BlueprintExecuteResponse(
            execution_id=result.get("execution_id", 0),
            status=ExecutionStatus(result.get("status", "failed")),
            outputs=result.get("outputs", {}),
            execution_state=result.get("execution_state", {}),
            steps=result.get("steps", []),
            error_message=result.get("error"),
            started_at=result.get("started_at"),
            completed_at=result.get("completed_at"),
            gui_schema=result.get("gui_schema"),
            tool_name=result.get("tool_name"),
            description=result.get("description"),
            waiting_node=result.get("waiting_node")
        )
    except Exception as e:
        print(f"[EXECUTION] 500 ERROR in resume_execution_input: {str(e)}")
        traceback.print_exc()
        execution.status = "failed"
        execution.error_message = str(e)
        execution.completed_at = datetime.utcnow()
        db.commit()
        raise HTTPException(status_code=500, detail=str(e))
