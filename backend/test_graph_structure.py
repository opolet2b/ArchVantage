import sqlite3
import json
from app.services.workflow_service import workflow_service
from app.core.database import get_db_path

def main():
    db_path = get_db_path() or "backend/db/sql_app.db"
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    cursor.execute("SELECT bpmn_json FROM workflow_templates WHERE name = 'tstWF'")
    row = cursor.fetchone()
    conn.close()
    if not row:
        print("tstWF template not found")
        return
        
    bpmn_json = json.loads(row[0]) if isinstance(row[0], str) else row[0]
    
    # Build LangGraph StateGraph
    workflow = workflow_service.build_graph(bpmn_json, "test_inst_123")
    
    # Compile
    app = workflow.compile()
    
    # Inspect using get_graph()
    g = app.get_graph()
    print("--- LangGraph Compiled Nodes ---")
    for node_id, node in g.nodes.items():
        print(f"Node ID: {node_id}")
        
    print("--- LangGraph Compiled Edges ---")
    for edge in g.edges:
        print(f"Edge: {edge.source} -> {edge.target}")

if __name__ == "__main__":
    main()
