import asyncio
import sqlite3
import json
import traceback
from datetime import datetime
from app.services.workflow_service import workflow_service
from app.core.database import SessionLocal, get_db_path
from app.models.workflow import WorkflowTemplate, WorkflowInstance, WorkflowExecutionLog, WorkflowStatus

async def main():
    db = SessionLocal()
    template = db.query(WorkflowTemplate).filter(WorkflowTemplate.name == "tstWF").first()
    if not template:
        print("Template tstWF not found!")
        db.close()
        return
        
    template_id = template.id
    db.close()
    
    print(f"Starting workflow for template: {template_id}")
    
    # Run the event loop execution
    res = await workflow_service.start_workflow(
        template_id=template_id,
        canvas_id="test_canvas",
        initial_payload={"test_var": "hello"},
        is_debug=False
    )
    
    print(f"Workflow started. Instance ID: {res['id']}")
    
    # Wait for 5 seconds to let background tasks run
    print("Waiting for background task execution...")
    await asyncio.sleep(5)
    
    # Query instance and logs
    db = SessionLocal()
    instance = db.query(WorkflowInstance).filter(WorkflowInstance.id == res["id"]).first()
    print("\n--- Instance State ---")
    if instance:
        print(f"Status: {instance.status}")
        print(f"Current Node IDs: {instance.current_node_ids}")
        print(f"Variables: {instance.state_payload.get('variables') if instance.state_payload else None}")
    else:
        print("Instance not found in DB!")
        
    logs = db.query(WorkflowExecutionLog).filter(WorkflowExecutionLog.instance_id == res["id"]).order_by(WorkflowExecutionLog.id).all()
    print("\n--- Execution Logs ---")
    for log in logs:
        print(f"[{log.action_type}] Node: {log.node_id}, Executor: {log.executed_by}, Result: {log.result_data}")
        
    db.close()

if __name__ == "__main__":
    asyncio.run(main())
