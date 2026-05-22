import sqlite3
import json

db_path = r"C:\Users\opole\Downloads\ChatBotn\backend\db\sql_app.db"
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

instances = ["7156729e-e541-49d4-94ed-8a4a079480bf", "8fb11426-fa40-4831-baa0-39d1a1f02e90"]
for inst in instances:
    print(f"\n--- LOGS FOR INSTANCE {inst} ---")
    cursor.execute("SELECT id, node_id, action_type, executed_by, timestamp, result_data FROM workflow_execution_logs WHERE instance_id = ?", (inst,))
    for row in cursor.fetchall():
        log_id, node_id, action, executor, ts, res_str = row
        print(f"ID: {log_id}, Node: {node_id}, Action: {action}, Executor: {executor}, Time: {ts}")
        print(f"  Result: {res_str}")

conn.close()
