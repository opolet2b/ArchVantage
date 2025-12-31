
import sqlite3
import os

def find_db():
    candidates = ["sql_app.db", "backend/sql_app.db", "../sql_app.db", "app/sql_app.db"]
    for path in candidates:
        if os.path.exists(path):
            return path
    return None

def add_column():
    db_path = find_db()
    if not db_path:
        print("Database sql_app.db not found in common locations.")
        # Create it? No, if it's missing, the app creates it on startup.
        # If I create it now, it might be empty.
        # But if the user says "Failed to save", the app IS running and DB exists.
        # Maybe it IS in backend/sql_app.db but I am running from backend dir?
        # Let's list dir to be sure.
        print(f"Propagating error: DB not found. CWD: {os.getcwd()}")
        print(f"Files: {os.listdir('.')}")
        return

    print(f"Found database at: {db_path}")
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    try:
        # Check if table exists
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='smart_analysis_templates';")
        if not cursor.fetchone():
            print("Table 'smart_analysis_templates' does not exist.")
            return

        # Check if column exists
        cursor.execute("PRAGMA table_info(smart_analysis_templates);")
        columns = [info[1] for info in cursor.fetchall()]
        
        if 'activity_type' not in columns:
            print("Adding 'activity_type' column to 'smart_analysis_templates'...")
            cursor.execute("ALTER TABLE smart_analysis_templates ADD COLUMN activity_type VARCHAR NOT NULL DEFAULT 'General';")
            conn.commit()
            print("Column added successfully.")
        else:
            print("Column 'activity_type' already exists.")
            
    except Exception as e:
        print(f"Error: {e}")
    finally:
        conn.close()

if __name__ == "__main__":
    add_column()
