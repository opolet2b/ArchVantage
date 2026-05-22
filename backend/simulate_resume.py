import asyncio
import sqlite3
import json
import traceback
from app.services.workflow_service import workflow_service
from app.core.database import SessionLocal, get_db_path
from app.models.workflow import WorkflowInstance, WorkflowExecutionLog, WorkflowStatus
from app.models.user import User

async def main():
    db = SessionLocal()
    # Find the last waiting instance
    instance = db.query(WorkflowInstance).filter(
        WorkflowInstance.status == WorkflowStatus.WAITING
    ).order_by(WorkflowInstance.created_at.desc()).first()
    
    if not instance:
        print("No waiting workflow instance found to resume!")
        db.close()
        return
        
    instance_id = instance.id
    print(f"Resuming instance ID: {instance_id}")
    
    # Get a dummy user to authenticate role check
    dummy_user = db.query(User).first()
    if not dummy_user:
        print("No user found in DB! Creating a temporary one for testing...")
        dummy_user = User(email="admin@example.com", is_active=True)
        db.add(dummy_user)
        db.commit()
    
    # Keep the session open during resume_workflow so lazy load of user.roles works
    res = await workflow_service.resume_workflow(
        instance_id=instance_id,
        user=dummy_user,
        form_data={"approval": True, "notes": "Approved successfully!"}
    )
    
    db.close()
    
    print(f"Workflow resume initiated. Status: {res['status']}")
    
    # Wait for 5 seconds to let execution run to completion
    print("Waiting for background task execution...")
    await asyncio.sleep(5)
    
    # Query instance and logs
    db = SessionLocal()
    instance_after = db.query(WorkflowInstance).filter(WorkflowInstance.id == instance_id).first()
    print("\n--- Instance State after Resume ---")
    if instance_after:
        print(f"Status: {instance_after.status}")
        print(f"Current Node IDs: {instance_after.current_node_ids}")
        print(f"Variables: {instance_after.state_payload.get('variables') if instance_after.state_payload else None}")
    else:
        print("Instance not found!")
        
    logs = db.query(WorkflowExecutionLog).filter(
        WorkflowExecutionLog.instance_id == instance_id
    ).order_by(WorkflowExecutionLog.id).all()
    
    print("\n--- Execution Logs after Resume ---")
    for log in logs:
        print(f"[{log.action_type}] Node: {log.node_id}, Executor: {log.executed_by}, Result: {log.result_data}")
        
    db.close()

if __name__ == "__main__":
    asyncio.run(main())
