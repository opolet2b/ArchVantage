import asyncio
import json
from app.services.workflow_service import workflow_service, get_saver
from app.core.database import SessionLocal, get_db_path
from app.models.workflow import WorkflowTemplate
from langgraph.checkpoint.sqlite.aio import AsyncSqliteSaver
import aiosqlite

async def main():
    db = SessionLocal()
    template = db.query(WorkflowTemplate).filter(WorkflowTemplate.name == "tstWF").first()
    template_id = template.id
    bpmn_json = template.bpmn_json
    db.close()
    
    instance_id = "debug_inst_999"
    workflow = workflow_service.build_graph(bpmn_json, instance_id)
    
    # Let's find user tasks
    user_task_ids = []
    for node in bpmn_json.get("nodes", []):
        node_type = str(node.get("type", "")).lower()
        if node_type in ["usertask", "user_task", "humantask", "bpmnusernode"]:
            user_task_ids.append(node.get("id"))
            
    print(f"Interrupt before: {user_task_ids}")
    
    config = {"configurable": {"thread_id": instance_id}}
    initial_state = {
        "variables": {"test": "val"},
        "current_node_ids": [],
        "status": "RUNNING"
    }
    
    db_path = get_db_path() or "backend/db/sql_app.db"
    async with aiosqlite.connect(db_path) as aio_conn:
        async_saver = AsyncSqliteSaver(aio_conn)
        app = workflow.compile(
            checkpointer=async_saver,
            interrupt_before=user_task_ids
        )
        
        print("Invoking graph...")
        result = await app.ainvoke(initial_state, config)
        print("Invoke completed. Result:", result)
        
        # Get state
        state = await app.aget_state(config)
        print("\n--- State Snapshot ---")
        print(f"Next: {state.next}")
        print(f"Values: {state.values}")
        print(f"Config: {state.config}")
        print(f"Metadata: {state.metadata}")

if __name__ == "__main__":
    asyncio.run(main())
