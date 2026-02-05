
import sqlite3
import os

db_path = "backend/db/sql_app.db"
if not os.path.exists(db_path):
    print(f"DB not found at {db_path}")
    exit(1)

conn = sqlite3.connect(db_path)
cur = conn.cursor()

print("--- TABLES ---")
cur.execute("SELECT name FROM sqlite_master WHERE type='table'")
for row in cur.fetchall():
    print(row[0])

print("\n--- AG CONFIGS ---")
try:
    cur.execute("SELECT key, value FROM ag_configs")
    for row in cur.fetchall():
        print(f"{row[0]}: {row[1]}")
except Exception as e:
    print(f"Error reading ag_configs: {e}")

conn.close()
