import sqlite3
conn = sqlite3.connect('db/sql_app.db')
cur = conn.cursor()
cur.execute("SELECT current_node_ids FROM workflow_instances WHERE id='10dffb31-8f25-4633-a2e2-24026c752e68'")
row = cur.fetchone()
print(repr(row[0]))
