
import sqlite3
import os

def migrate():
    db_path = "c:/Users/opole/Downloads/ChatBotn/backend/db/sql_app.db"
    
    if not os.path.exists(db_path):
        print(f"Database not found at {db_path}")
        return

    print(f"Connecting to {db_path}...")
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    try:
        # Check if domains table exists
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='domains';")
        if not cursor.fetchone():
            print("Table 'domains' not found.")
            return

        # Check if metadata_values column already exists
        cursor.execute("PRAGMA table_info(domains);")
        columns = [info[1] for info in cursor.fetchall()]
        
        if 'metadata_values' not in columns:
            print("Adding 'metadata_values' column to 'domains' table...")
            # Use JSON column type (TEXT in SQLite)
            cursor.execute("ALTER TABLE domains ADD COLUMN metadata_values TEXT;")
            conn.commit()
            print("Column 'metadata_values' added successfully.")
        else:
            print("Column 'metadata_values' already exists.")

    except Exception as e:
        print(f"Error during migration: {e}")
    finally:
        conn.close()

if __name__ == "__main__":
    migrate()
