import sqlite3
import json
from app.services.workflow_service import workflow_service
from app.core.database import get_db_path

def inspect_edges():
    db_path = get_db_path() or "backend/db/sql_app.db"
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    cursor.execute("SELECT bpmn_json FROM workflow_templates WHERE name = 'tstWF'")
    row = cursor.fetchone()
    conn.close()
    if not row:
        print("tstWF not found")
        return
    bpmn_json = json.loads(row[0]) if isinstance(row[0], str) else row[0]
    
    print("--- BPMN Nodes ---")
    for n in bpmn_json.get("nodes", []):
        print(f"Node: {n.get('id')}, Type: {n.get('type')}")
        
    print("--- BPMN Edges ---")
    for e in bpmn_json.get("edges", []):
        print(f"Edge: {e.get('source')} -> {e.get('target')}")
        
    # Build LangGraph
    workflow = workflow_service.build_graph(bpmn_json, "test_inst")
    
    print("--- LangGraph Nodes ---")
    print(list(workflow.nodes.keys()))
    
    print("--- LangGraph Edges ---")
    # Let's inspect the internal edges of the StateGraph builder
    builder_edges = workflow.builder.edges
    print(builder_edges)

if __name__ == "__main__":
    inspect_edges()
