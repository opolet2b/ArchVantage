import sqlite3
import json

db_path = 'db/sql_app.db'
conn = sqlite3.connect(db_path)
conn.row_factory = sqlite3.Row
cur = conn.cursor()

cur.execute("SELECT template_id FROM workflow_instances WHERE id = '10dffb31-8f25-4633-a2e2-24026c752e68'")
template_id = cur.fetchone()['template_id']

cur.execute("SELECT bpmn_json FROM workflow_templates WHERE id = ?", (template_id,))
bpmn_json_str = cur.fetchone()['bpmn_json']
bpmn = json.loads(bpmn_json_str)

for node in bpmn.get('nodes', []):
    if node.get('id') == 'user_task_8f085f37':
        print('Found Node:', node.get('id'))
        print('Node Data:', node.get('data'))
