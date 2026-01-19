
import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).parent.parent / "db" / "sql_app.db"

def list_canvases():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    print("--- ALL CANVASES ---")
    cursor.execute("SELECT name, id, analysis_space_id FROM canvases ORDER BY name")
    rows = cursor.fetchall()
    
    for r in rows:
        print(f"Name: '{r[0]}'")
        print(f"  ID: {r[1]}")
        print(f"  Space: {r[2]}")
        print("")

    conn.close()

if __name__ == "__main__":
    list_canvases()
