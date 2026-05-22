import sqlite3
import json

db_path = r"C:\Users\opole\Downloads\ChatBotn\backend\db\sql_app.db"
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

# Get recent instances
cursor.execute("SELECT id, template_id, status, current_node_ids, is_debug, created_at FROM workflow_instances ORDER BY created_at DESC LIMIT 10")
instances = cursor.fetchall()
print(f"Found {len(instances)} workflow instances:")
for inst in instances:
    print(f"Instance ID: {inst[0]}, Template ID: {inst[1]}, Status: {inst[2]}, Current Nodes: {inst[3]}, IsDebug: {inst[4]}, Created: {inst[5]}")
    
    # Get execution logs for this instance
    cursor.execute("SELECT id, node_id, action_type, executed_by, result_data, timestamp FROM workflow_execution_logs WHERE instance_id = ? ORDER BY id ASC", (inst[0],))
    logs = cursor.fetchall()
    print("  Execution Logs:")
    for log in logs:
        print(f"    Log ID: {log[0]}, Node ID: {log[1]}, Action: {log[2]}, By: {log[3]}, Timestamp: {log[5]}")
        print(f"      Result: {log[4]}")
    print("-" * 50)

conn.close()
