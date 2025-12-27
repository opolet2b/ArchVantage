import sqlite3
import json

DB_PATH = "./db/sql_app.db"
TARGET_ASSET_ID = "802458c5-9864-409e-8ed8-5cad9c07bf6a"

def inspect_thing():
    print(f"Connecting to SQLite DB at {DB_PATH}...")
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        
        print(f"Searching for Thing with asset_id: {TARGET_ASSET_ID} in content...")
        
        # We have to scan because content is JSON (text)
        cursor.execute("SELECT id, type, content, rag_status FROM canvas_things")
        rows = cursor.fetchall()
        
        found = False
        for row in rows:
            thing_id, thing_type, content_json, rag_status = row
            try:
                content = json.loads(content_json)
                if content.get("asset_id") == TARGET_ASSET_ID:
                    print(f"\n!!! FOUND MATCHING THING !!!")
                    print(f"ID: {thing_id}")
                    print(f"Type: {thing_type}")
                    print(f"RAG Status: {rag_status}")
                    file_path = content.get("file_path", "NOT FOUND")
                    print(f"FILE PATH: {file_path}")
                    # print(f"Content: {json.dumps(content, indent=2)}") # Suppress full dump
                    found = True
            except:
                pass
                
        if not found:
            print("\nNO THING FOUND with that asset_id.")
            
    except Exception as e:
        print(f"Error: {e}")
    finally:
        conn.close()

if __name__ == "__main__":
    inspect_thing()
