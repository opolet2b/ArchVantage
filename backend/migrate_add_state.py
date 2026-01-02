
import sqlite3
import os

import sys

# Add root to sys.path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.core.database import get_db_path

DB_PATH = get_db_path() or "db/sql_app.db"

def migrate():
    if not os.path.exists(DB_PATH):
        print(f"Database not found at {DB_PATH}")
        return

    print(f"Connecting to database at {DB_PATH}")
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    try:
        # Check if column exists
        cursor.execute("PRAGMA table_info(agent_executions)")
        columns = [info[1] for info in cursor.fetchall()]
        
        if "state" in columns:
            print("Column 'state' already exists in 'agent_executions'.")
        else:
            print("Adding column 'state' to 'agent_executions'...")
            cursor.execute("ALTER TABLE agent_executions ADD COLUMN state JSON")
            conn.commit()
            print("Migration successful.")
            
    except Exception as e:
        print(f"Migration failed: {e}")
        conn.rollback()
    finally:
        conn.close()

if __name__ == "__main__":
    migrate()
