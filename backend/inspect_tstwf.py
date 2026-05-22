import sqlite3
import json

db_path = r"C:\Users\opole\Downloads\ChatBotn\backend\db\sql_app.db"
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

# Get all templates
cursor.execute("SELECT id, name, description, bpmn_json FROM workflow_templates")
rows = cursor.fetchall()
print(f"Total templates found: {len(rows)}")
for row in rows:
    tid, name, desc, bpmn_json_str = row
    print(f"\nTemplate ID: {tid}")
    print(f"Name: {name}")
    print(f"Description: {desc}")
    try:
        bpmn_json = json.loads(bpmn_json_str) if isinstance(bpmn_json_str, str) else bpmn_json_str
        print("Nodes:")
        for node in bpmn_json.get("nodes", []):
            print(f"  - Node ID: {node.get('id')}, Type: {node.get('type')}, Label: {node.get('data', {}).get('label') or node.get('name')}")
        print("Edges:")
        for edge in bpmn_json.get("edges", []):
            print(f"  - Source: {edge.get('source')}, Target: {edge.get('target')}")
    except Exception as e:
        print(f"Error parsing JSON: {e}")

conn.close()
