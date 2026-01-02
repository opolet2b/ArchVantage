import sqlite3
import json

import sys
import os

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from app.core.database import get_db_path

db_path = get_db_path() or 'db/sql_app.db'
conn = sqlite3.connect(db_path)
cursor = conn.cursor()
cursor.execute("SELECT graph FROM agent_blueprints WHERE name LIKE '%Country%Capital%'")
row = cursor.fetchone()

if row:
    graph = json.loads(row[0])
    print(json.dumps(graph, indent=2))
else:
    print("Not found")

conn.close()
