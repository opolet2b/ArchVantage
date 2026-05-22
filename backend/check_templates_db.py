import sqlite3
import json

db_path = r"C:\Users\opole\Downloads\ChatBotn\backend\db\sql_app.db"
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

print("--- WORKFLOW TEMPLATES ---")
cursor.execute("SELECT id, name, bpmn_json FROM workflow_templates")
for row in cursor.fetchall():
    t_id, name, bpmn_str = row
    print(f"ID: {t_id}, Name: {name}")
    try:
        bpmn = json.loads(bpmn_str) if isinstance(bpmn_str, str) else bpmn_str
        nodes = bpmn.get("nodes", [])
        edges = bpmn.get("edges", [])
        print("  Nodes:")
        for node in nodes:
            print(f"    - ID: {node.get('id')}, Type: {node.get('type')}, Label: {node.get('data', {}).get('label')}, FormToolId: {node.get('data', {}).get('form_tool_id')}")
        print("  Edges:")
        for edge in edges:
            print(f"    - Source: {edge.get('source')} -> Target: {edge.get('target')}")
    except Exception as e:
        print(f"  Error parsing BPMN JSON: {e}")

print("\n--- WORKFLOW INSTANCES ---")
cursor.execute("SELECT id, template_id, status, current_node_ids, is_debug FROM workflow_instances")
for row in cursor.fetchall():
    i_id, t_id, status, current_nodes, is_debug = row
    print(f"ID: {i_id}, Template ID: {t_id}, Status: {status}, Current Nodes: {current_nodes}, Is Debug: {is_debug}")

conn.close()
