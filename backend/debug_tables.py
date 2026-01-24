import sqlite3
import json

try:
    conn = sqlite3.connect('db/sql_app.db')
    cursor = conn.cursor()
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
    tables = [t[0] for t in cursor.fetchall()]
    print("Tables:", tables)

    target_table = None
    if 'things' in tables: target_table = 'things'
    elif 'canvas_things' in tables: target_table = 'canvas_things'
    
    if target_table:
        print(f"Querying table: {target_table}")
        cursor.execute(f"SELECT DISTINCT type FROM {target_table}")
        print("Distinct Types:", [row[0] for row in cursor.fetchall()])

        cursor.execute(f"SELECT id, type, summaries, content FROM {target_table} WHERE type LIKE '%doc%' OR type LIKE '%DOC%' ORDER BY updated_at DESC LIMIT 5")
    else:
        print("Could not find things table.")
        exit()

    rows = cursor.fetchall()
    if rows:
        for row in rows:
            print(f"--- Thing ID: {row[0]} ---")
            print(f"Type: {row[1]}")
            print(f"Summaries: {row[2]}")
            print(f"Content Keys: {list(json.loads(row[3]).keys()) if row[3] else 'None'}")
    else:
        print("No things found.")
except Exception as e:
    print(f"Error: {e}")
