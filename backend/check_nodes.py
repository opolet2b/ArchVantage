import sqlite3
import json

conn = sqlite3.connect('db/sql_app.db')
cur = conn.cursor()
cur.execute("SELECT template_id FROM workflow_instances WHERE id='e9bf7646-fce5-4a19-bc44-a62a5410831f'")
template_id = cur.fetchone()[0]

cur.execute("SELECT bpmn_json FROM workflow_templates WHERE id=?", (template_id,))
data = json.loads(cur.fetchone()[0])
for node in data.get("nodes", []):
    print(f"Node: {node.get('id')}, Type: {node.get('type')}")
conn.close()
