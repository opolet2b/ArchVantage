import sqlite3
import json

conn = sqlite3.connect('data/sql_app.db')
cursor = conn.cursor()
cursor.execute("SELECT graph FROM agent_blueprints WHERE name LIKE '%Country%Capital%'")
row = cursor.fetchone()

if row:
    graph = json.loads(row[0])
    print(json.dumps(graph, indent=2))
else:
    print("Not found")

conn.close()
