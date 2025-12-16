from app.core.database import SessionLocal
from app.models.agent_blueprint import AgentExecution
from app.models.user import User

db = SessionLocal()
try:
    execution = db.query(AgentExecution).filter(AgentExecution.id == 24).first()
    if execution:
        print(f"ID: {execution.id}")
        print(f"Status: '{execution.status}'")
        print(f"Error: {execution.error_message}")
        print(f"User ID: {execution.user_id}")
        print(f"State keys: {list(execution.state.keys()) if execution.state else 'None'}")
    else:
        print("Execution 24 not found")
finally:
    db.close()
