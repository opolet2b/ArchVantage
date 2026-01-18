
import sqlite3
import os

# Path to the database
# Assuming standard location for the app. The user is in "c:/Users/opole/Downloads/ChatBotn"
# Backend is in "backend"
# Database is usually "sql_app.db" or similar in backend directory or root.
# I need to find the database file.
# I'll check "backend/sql_app.db" or "backend/app.db" or similar.
# Based on common patterns in this project (FastAPI), it might be `backend/sql_app.db`.

DB_PATH = "backend/db/sql_app.db"

def add_column(cursor, table_name, column_name, column_type):
    try:
        cursor.execute(f"ALTER TABLE {table_name} ADD COLUMN {column_name} {column_type}")
        print(f"Added column {column_name} to {table_name}")
    except sqlite3.OperationalError as e:
        if "duplicate column" in str(e).lower():
            print(f"Column {column_name} already exists in {table_name}")
        else:
            print(f"Error adding {column_name}: {e}")

def migrate():
    if not os.path.exists(DB_PATH):
        print(f"Database not found at {DB_PATH}. Trying absolute path...")
        # Try to resolve relative to current working directory if script is run from root
        abs_path = os.path.join(os.getcwd(), "backend", "sql_app.db")
        if not os.path.exists(abs_path):
             print(f"Database not found at {abs_path} either. Please check path.")
             return
        db_path = abs_path
    else:
        db_path = DB_PATH

    print(f"Migrating database at {db_path}...")
    
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    # Add target_canvas_id
    add_column(cursor, "canvas_links", "target_canvas_id", "VARCHAR(36)")

    # Add description
    add_column(cursor, "canvas_links", "description", "TEXT")

    conn.commit()
    conn.close()
    print("Migration complete.")

if __name__ == "__main__":
    migrate()
