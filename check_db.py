import sqlite3
import os

db_path = "backend/db/sql_app.db"

if not os.path.exists(db_path):
    print(f"Database not found at {db_path}")
    # Try alternate path if running from root vs backend
    if os.path.exists("db/sql_app.db"):
        db_path = "db/sql_app.db"
    elif os.path.exists("app/db/sql_app.db"):
         db_path = "app/db/sql_app.db"
    elif os.path.exists("backend/app/db/sql_app.db"):
         db_path = "backend/app/db/sql_app.db"
    
print(f"Checking database at: {db_path}")

try:
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    cursor.execute("PRAGMA table_info(canvas_links)")
    columns = cursor.fetchall()
    
    print("Columns in canvas_links:")
    found_description = False
    for col in columns:
        print(col)
        if col[1] == 'description':
            found_description = True
            
    if found_description:
        print("\nSUCCESS: 'description' column FOUND.")
    else:
        print("\nFAILURE: 'description' column NOT FOUND.")
        
    conn.close()
except Exception as e:
    print(f"Error: {e}")
