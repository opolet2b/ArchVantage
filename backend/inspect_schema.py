import sqlite3
import os

DB_PATH = "c:/Users/opole/Downloads/ChatBotn/backend/db/sql_app.db"

def inspect_schema():
    if not os.path.exists(DB_PATH):
        print(f"Error: Database file not found at {DB_PATH}")
        return

    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        
        table_name = "smart_analysis_templates"
        print(f"Inspecting table: {table_name}")
        
        cursor.execute(f"PRAGMA table_info({table_name});")
        columns = cursor.fetchall()
        
        if not columns:
            print(f"Table '{table_name}' does not exist!")
        else:
            print(f"Found {len(columns)} columns:")
            for col in columns:
                # col structure: (cid, name, type, notnull, dflt_value, pk)
                print(f"- {col[1]} ({col[2]})")

    except Exception as e:
        print(f"Error inspecting schema: {e}")
    finally:
        if conn:
            conn.close()

if __name__ == "__main__":
    inspect_schema()
