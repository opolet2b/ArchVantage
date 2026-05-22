import sqlite3
import json

db_path = r"C:\Users\opole\Downloads\ChatBotn\backend\db\sql_app.db"
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

cursor.execute("SELECT id, name, bpmn_json FROM workflow_templates WHERE name LIKE '%tstWF%'")
rows = cursor.fetchall()
print(f"Found {len(rows)} matching templates:")
for r in rows:
    print(f"ID: {r[0]}, Name: {r[1]}")
    bpmn = json.loads(r[2])
    print("Nodes in BPMN:")
    for node in bpmn.get("nodes", []):
        print(f"  Node ID: {node.get('id')}, Type: {node.get('type')}, Label: {node.get('data', {}).get('label')}, FormToolId: {node.get('data', {}).get('form_tool_id')}")
    print("Edges in BPMN:")
    for edge in bpmn.get("edges", []):
        print(f"  Source: {edge.get('source')} -> Target: {edge.get('target')}")

conn.close()
