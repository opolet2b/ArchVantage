import sqlite3
import json

def check():
    try:
        conn = sqlite3.connect('C:/Users/opole/Downloads/ChatBotn/backend/db/sql_app.db')
        c = conn.cursor()
        c.execute("SELECT id, type, content FROM canvas_things ORDER BY created_at DESC LIMIT 5")
        rows = c.fetchall()
        for row in rows:
            content = json.loads(row[2])
            print("ID:", row[0], "Type:", row[1])
            print("Content:", json.dumps(content, indent=2)[:500]) # truncated for brevity
            print("----")
    except Exception as e:
        print("Error:", e)

if __name__ == '__main__':
    check()
