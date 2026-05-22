import sqlite3
import json

db_path = r"C:\Users\opole\Downloads\ChatBotn\backend\db\sql_app.db"
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

# Get templates
cursor.execute("SELECT id, name FROM workflow_templates")
templates = {row[0]: row[1] for row in cursor.fetchall()}

# Get instances
cursor.execute("SELECT id, template_id, status, current_node_ids, state_payload, created_at, updated_at FROM workflow_instances ORDER BY created_at DESC LIMIT 5")
instances = cursor.fetchall()
print(f"--- Last 5 Instances ---")
for inst in instances:
    iid, tid, status, current_nodes, payload, created, updated = inst
    template_name = templates.get(tid, "Unknown")
    print(f"\nInstance ID: {iid}")
    print(f"Template Name: {template_name} (ID: {tid})")
    print(f"Status: {status}")
    print(f"Current Nodes: {current_nodes}")
    print(f"Created: {created}, Updated: {updated}")
    
    # Get execution logs for this instance
    cursor.execute("SELECT id, node_id, action_type, executed_by, timestamp, result_data FROM workflow_execution_logs WHERE instance_id = ? ORDER BY timestamp ASC", (iid,))
    logs = cursor.fetchall()
    print("Logs:")
    for log in logs:
        lid, nid, action, actor, ts, res_data_str = log
        res_data = None
        if res_data_str:
            try:
                res_data = json.loads(res_data_str) if isinstance(res_data_str, str) else res_data_str
            except:
                res_data = res_data_str
        print(f"  [{ts}] Node: {nid} | Action: {action} | By: {actor} | Details: {res_data}")

conn.close()
