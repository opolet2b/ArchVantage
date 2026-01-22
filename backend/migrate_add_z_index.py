
import sqlite3
import os
import sys

# Add root to sys.path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

def find_db():
    # Prioritize the backend/db path
    candidates = ["backend/db/sql_app.db", "db/sql_app.db", "sql_app.db"]
    
    for path in candidates:
        if os.path.exists(path):
            return path
    return None

def migrate_z_index():
    # Force the known correct path relative to project root if running from root
    db_path = "backend/db/sql_app.db"
    
    if not os.path.exists(db_path):
         db_path = find_db()
    
    if not db_path or not os.path.exists(db_path):
        print(f"Database not found. Searched: {db_path}")
        return

    print(f"Migrating database at: {db_path}")
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    try:
        # 1. Update canvas_things
        cursor.execute("PRAGMA table_info(canvas_things);")
        columns = [info[1] for info in cursor.fetchall()]
        
        if 'z_index' not in columns:
            print("Adding 'z_index' column to 'canvas_things'...")
            # Default to 0.0 for Things as per plan
            cursor.execute("ALTER TABLE canvas_things ADD COLUMN z_index REAL NOT NULL DEFAULT 0.0;")
            print("Column 'z_index' added to 'canvas_things'.")
        else:
            print("Column 'z_index' already exists in 'canvas_things'.")

        # 2. Update domains
        cursor.execute("PRAGMA table_info(domains);")
        columns_d = [info[1] for info in cursor.fetchall()]
        
        if 'z_index' not in columns_d:
            print("Adding 'z_index' column to 'domains'...")
            # Default to -1.0 for Domains (behind things)
            cursor.execute("ALTER TABLE domains ADD COLUMN z_index REAL NOT NULL DEFAULT -1.0;")
            print("Column 'z_index' added to 'domains'.")
        else:
            print("Column 'z_index' already exists in 'domains'.")
            
        conn.commit()
        print("Migration complete.")
            
    except Exception as e:
        print(f"Error during migration: {e}")
        conn.rollback()
    finally:
        conn.close()

if __name__ == "__main__":
    migrate_z_index()
