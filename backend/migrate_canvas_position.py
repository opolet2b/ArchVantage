
import sqlite3
import os
import sys

# Add root to sys.path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

def find_db():
    # Prioritize the backend/db path as it seems to be the active one
    candidates = ["backend/db/sql_app.db", "db/sql_app.db", "sql_app.db"]
    
    # Try using app config if available
    try:
        from app.core.database import get_db_path
        candidates.insert(0, get_db_path())
    except:
        pass

    for path in candidates:
        if os.path.exists(path):
            return path
    return None

def migrate_canvas_position():
    # Force the known correct path relative to project root
    db_path = "backend/db/sql_app.db"
    
    if not os.path.exists(db_path):
         print(f"Explicit path not found: {db_path}")
         # Fallback search
         db_path = find_db()

    print(f"Migrating database at: {db_path}")
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    try:
        # Check if column exists
        cursor.execute("PRAGMA table_info(canvases);")
        columns = [info[1] for info in cursor.fetchall()]
        
        if 'position' not in columns:
            print("Adding 'position' column to 'canvases'...")
            # Default to 0 so all existing items appear at top until reordered
            cursor.execute("ALTER TABLE canvases ADD COLUMN position INTEGER NOT NULL DEFAULT 0;")
            conn.commit()
            print("Column 'position' added successfully.")
        else:
            print("Column 'position' already exists in 'canvases'.")
            
    except Exception as e:
        print(f"Error during migration: {e}")
    finally:
        conn.close()

if __name__ == "__main__":
    migrate_canvas_position()
