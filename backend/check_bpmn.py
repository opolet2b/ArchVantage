import sqlite3
import json

try:
    conn = sqlite3.connect('db/sql_app.db')
    cur = conn.cursor()
    # e9bf7646-fce5-4a19-bc44-a62a5410831f is the new instance ID
    cur.execute("SELECT template_id FROM workflow_instances WHERE id='e9bf7646-fce5-4a19-bc44-a62a5410831f'")
    row = cur.fetchone()
    if row:
        template_id = row[0]
        cur.execute("SELECT bpmn_json FROM workflow_templates WHERE id=?", (template_id,))
        template_row = cur.fetchone()
        if template_row:
            data = json.loads(template_row[0])
            print("Parsed bpmn_json type is:", type(data))
except Exception as e:
    print(f'Error: {e}')
finally:
    if 'conn' in locals():
        conn.close()
