import sqlite3

conn = sqlite3.connect('db/sql_app.db')
cur = conn.cursor()
cur.execute("SELECT status, current_node_ids FROM workflow_instances WHERE id='e9bf7646-fce5-4a19-bc44-a62a5410831f'")
row = cur.fetchone()
if row:
    print(f'Status: {row[0]}, Nodes: {row[1]}')
else:
    print('Instance not found.')
conn.close()
