import sqlite3

def check():
    conn = sqlite3.connect('c:/Users/opole/Downloads/ChatBotn/backend/db/sql_app.db')
    c = conn.cursor()
    c.execute("SELECT id, title, rag_status, type, created_at FROM canvas_things WHERE rag_status='processing' ORDER BY created_at DESC LIMIT 5")
    rows = c.fetchall()
    print("Processing Rows:")
    for r in rows:
        print(r)
        
    c.execute("SELECT id, title, rag_status, type, created_at FROM canvas_things ORDER BY created_at DESC LIMIT 5")
    rows = c.fetchall()
    print("\nMost Recent Rows (any status):")
    for r in rows:
        print(r)

if __name__ == '__main__':
    check()
