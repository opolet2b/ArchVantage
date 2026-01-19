
import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).parent.parent / "db" / "sql_app.db"

def verify():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    cursor.execute("SELECT id, name, analysis_space_id FROM canvases")
    rows = cursor.fetchall()
    
    print(f"Found {len(rows)} canvases.")
    for r in rows:
        print(f"NAME: {r[1]}")
        print(f"SPACE: {r[2]}")
        print("-" * 20)
        
    canvases = {row[1]: {"id": row[0], "space": row[2]} for row in rows}
    
    c1 = canvases.get("Untitled Canvas 1")
    c2 = canvases.get("ERZ")
    
    if not c1 or not c2:
        print("Required canvases not found.")
    else:
        print(f"Canvas 1 (Untitled): {c1['space']}")
        print(f"Canvas 2 (ERZ): {c2['space']}")
        
        if c1['space'] == c2['space'] and c1['space'] is not None:
            print("MATCH: Both are in the same space.")
        else:
            print("MISMATCH: They are NOT in the same space.")
            
    conn.close()

if __name__ == "__main__":
    verify()
