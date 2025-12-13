import sqlite3
import json

conn = sqlite3.connect('data/sql_app.db')
cursor = conn.cursor()
cursor.execute("SELECT configuration FROM tools WHERE id = 4")
row = cursor.fetchone()

if row:
    config = json.loads(row[0])
    print(json.dumps(config, indent=2))
else:
    print("Tool not found")

conn.close()
