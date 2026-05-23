import sqlite3
import json
conn = sqlite3.connect('db/sql_app.db')
cur = conn.cursor()
cur.execute("SELECT state_payload FROM workflow_instances WHERE id='10dffb31-8f25-4633-a2e2-24026c752e68'")
row = cur.fetchone()
print(repr(row[0][:100]))
try:
    data = json.loads(row[0])
    print("Parsed to JSON successfully, type is:", type(data))
    if isinstance(data, str):
        print("Wait, it parsed to a string. It was double encoded!")
except Exception as e:
    print("Error parsing:", e)
