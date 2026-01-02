import sqlite3
import json

import sys
import os

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from app.core.database import get_db_path

db_path = get_db_path() or 'db/sql_app.db'
conn = sqlite3.connect(db_path)
cursor = conn.cursor()
cursor.execute("SELECT configuration FROM tools WHERE id = 4")
row = cursor.fetchone()

if row:
    config = json.loads(row[0])
    print(json.dumps(config, indent=2))
else:
    print("Tool not found")

conn.close()
