
import sqlite3
import os

db_path = "backend/db/sql_app.db"
conn = sqlite3.connect(db_path)
cur = conn.cursor()

print("--- AG CONFIGS ---")
try:
    # Use a broader query to find any config table
    cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '%config%'")
    tables = [row[0] for row in cur.fetchall()]
    print(f"Found config tables: {tables}")
    
    for table in tables:
        print(f"\nContent of {table}:")
        cur.execute(f"SELECT * FROM {table}")
        for row in cur.fetchall():
            print(row)
except Exception as e:
    print(f"Error: {e}")

conn.close()
