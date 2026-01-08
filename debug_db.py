import sqlite3
import json
import os

# Connect to database (adjust path if needed)
db_path = "backend/db/sql_app.db"
if not os.path.exists(db_path):
    print(f"Database not found at {db_path}")
    exit(1)

conn = sqlite3.connect(db_path)
cursor = conn.cursor()

# Get list of tables
cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
tables = cursor.fetchall()
print("Tables found:")
for t in tables:
    print(f" - {t[0]}")

table_name = "canvas_things"
print(f"Using table: {table_name}")

# List columns
cursor.execute(f"PRAGMA table_info({table_name});")
columns = cursor.fetchall()
print("Columns:", [c[1] for c in columns])

try:
    # Use content or whatever column holds the json
    # Let's assume it might be 'content' but maybe I was wrong.
    # The columns print will verify this.
    # For now, select * to be safe in the python code later
    cursor.execute(f"SELECT * FROM {table_name} ORDER BY created_at DESC LIMIT 5")
    rows = cursor.fetchall()
    
    # Get column names
    col_names = [description[0] for description in cursor.description]
    
    with open("debug_output.json", "w", encoding="utf-8") as f:
        output = []
        for r in rows:
            # Create dict for easier access
            row_dict = dict(zip(col_names, r))
            
            tid = row_dict.get('id')
            ttype = row_dict.get('type')
            created = row_dict.get('created_at')
            content_val = row_dict.get('content') 
            
            item = {"id": tid, "type": ttype, "created": str(created)}
            
            if content_val:
                try:
                    if isinstance(content_val, str):
                        data = json.loads(content_val)
                    else:
                        data = content_val
                    
                    item["content"] = data
                except Exception as e:
                    item["error"] = str(e)
                    item["raw_content"] = str(content_val)[:200]
            
            output.append(item)
        
        json.dump(output, f, indent=2, default=str)
    
    print("Dumped to debug_output.json")

except Exception as e:
    print(f"Query failed: {e}")

conn.close()

conn.close()
