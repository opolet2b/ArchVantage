import sqlite3

try:
    conn = sqlite3.connect('db/sql_app.db')
    cur = conn.cursor()
    cur.execute("SELECT status, current_node_ids FROM workflow_instances WHERE id='460f6a66-f655-444c-a514-3385626fb842'")
    row = cur.fetchone()
    if row:
        print(f'Status: {row[0]}, Nodes: {row[1]}')
    else:
        print('Instance not found.')
except Exception as e:
    print(f'Error: {e}')
finally:
    if 'conn' in locals():
        conn.close()
