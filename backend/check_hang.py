import sqlite3

def check():
    conn = sqlite3.connect('c:/Users/opole/Downloads/ChatBotn/backend/db/sql_app.db')
    c = conn.cursor()
    # Get the latest skillsmatrix thing
    c.execute("SELECT id, title, rag_status, type FROM canvas_things WHERE title LIKE '%skillsmatrix%' ORDER BY created_at DESC LIMIT 1")
    row = c.fetchone()
    print("Latest DB Row:", row)
    
    print("\nRecent execution logs:")
    try:
        with open('c:/Users/opole/Downloads/ChatBotn/backend/execution_debug.log', 'r', encoding='utf-8', errors='replace') as f:
            lines = f.readlines()
            for line in lines[-100:]:
                if "skillsmatrix" in line or "CanvasWorker" in line:
                    print(line.strip())
    except Exception as e:
        print(e)
        
    print("\nRecent app logs:")
    try:
        with open('c:/Users/opole/Downloads/ChatBotn/backend/app_debug.log', 'r', encoding='utf-8', errors='replace') as f:
            lines = f.readlines()
            for line in lines[-100:]:
                if "skillsmatrix" in line or "CanvasWorker" in line or "DocumentIngestor" in line:
                    print(line.strip())
    except Exception as e:
        print(e)

if __name__ == '__main__':
    check()
