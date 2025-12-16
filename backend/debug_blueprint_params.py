
import sys
import os
import json
from sqlalchemy import create_engine, desc
from sqlalchemy.orm import sessionmaker

# Add backend to path
sys.path.append(os.path.join(os.path.dirname(__file__), "app"))

from app.core.database import Base
from app.models.user import User  # Required for relationships
from app.models.agent_blueprint import AgentBlueprint, AgentExecution

# Assume SQLALCHEMY_DATABASE_URL matches app/core/database.py
SQLALCHEMY_DATABASE_URL = "sqlite:///./data/sql_app.db"
engine = create_engine(SQLALCHEMY_DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
db = SessionLocal()

def inspect_latest_execution():
    # Get latest execution
    execution = db.query(AgentExecution).order_by(desc(AgentExecution.started_at)).first()
    if not execution:
        print("No executions found.")
        return

    print(f"Latest Execution ID: {execution.id}")
    print(f"Blueprint ID: {execution.blueprint_id}")
    
    blueprint = db.query(AgentBlueprint).filter(AgentBlueprint.id == execution.blueprint_id).first()
    if not blueprint:
        print("Blueprint not found.")
        return

    print(f"Blueprint Name: {blueprint.name}")
    
    # Check Graph
    graph = blueprint.graph
    if isinstance(graph, str):
        graph = json.loads(graph)
    
    nodes = graph.get("nodes", [])
    print(f"Found {len(nodes)} nodes.")
    
    for node in nodes:
        node_type = node.get("type", "")
        # Handle Enum serialization
        if hasattr(node_type, "value"): node_type = node_type.value
        
        if node_type == "END":
            print(f"--- END NODE ({node.get('id')}) ---")
            params = node.get("params", {})
            print("Params:", json.dumps(params, indent=2))
            
            tpl = params.get("output_template")
            print(f"Output Template Type: {type(tpl)}")
            print(f"Output Template Value: {tpl}")
            
            if tpl is None:
                print("FAIL: Template is None")
            elif isinstance(tpl, dict) and len(tpl) == 0:
                print("WARN: Template is Empty Dict")
            else:
                print("SUCCESS: Template seems valid")

if __name__ == "__main__":
    inspect_latest_execution()
