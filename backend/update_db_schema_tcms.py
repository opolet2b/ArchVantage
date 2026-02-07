
import sqlite3
import os
import sys

# Add root to sys.path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

def find_db():
    # Prioritize the specific user path or local dev paths
    candidates = [
        "c:/Users/opole/Downloads/ChatBotn/backend/db/sql_app.db",
        "db/sql_app.db",
        "sql_app.db",
        "backend/db/sql_app.db"
    ]
    for path in candidates:
        if os.path.exists(path):
            return path
    return None

def add_columns():
    db_path = find_db()
    if not db_path:
        print("Database sql_app.db not found.")
        return

    print(f"Found database at: {db_path}")
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    try:
        # Check if table exists
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='canvas_things';")
        if not cursor.fetchone():
            print("Table 'canvas_things' does not exist.")
            return

        # Check existing columns
        cursor.execute("PRAGMA table_info(canvas_things);")
        columns = [info[1] for info in cursor.fetchall()]
        
        # Add technical_metadata
        if 'technical_metadata' not in columns:
            print("Adding 'technical_metadata' column...")
            # JSON type text in SQLite
            cursor.execute("ALTER TABLE canvas_things ADD COLUMN technical_metadata JSON NOT NULL DEFAULT '{}';")
            print("Column 'technical_metadata' added.")
        else:
            print("Column 'technical_metadata' already exists.")

        # Add custom_metadata
        if 'custom_metadata' not in columns:
            print("Adding 'custom_metadata' column...")
            cursor.execute("ALTER TABLE canvas_things ADD COLUMN custom_metadata JSON NOT NULL DEFAULT '{}';")
            print("Column 'custom_metadata' added.")
        else:
            print("Column 'custom_metadata' already exists.")
            
        conn.commit()
        print("Migration completed successfully.")
            
    except Exception as e:
        print(f"Error: {e}")
        conn.rollback()
    finally:
        conn.close()

if __name__ == "__main__":
    add_columns()
