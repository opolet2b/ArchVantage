import sqlite3
import json

def get_kbs():
    conn = sqlite3.connect('backend/db/sql_app.db')
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    cursor.execute("SELECT id, name, status, sources, selected_source_ids FROM knowledge_base_configs")
    rows = cursor.fetchall()
    
    for row in rows:
        print(f"KB: {row['name']} (ID: {row['id']}) - Status: {row['status']}")
        
        sources = json.loads(row['sources']) if row['sources'] else []
        selected_ids = json.loads(row['selected_source_ids']) if row['selected_source_ids'] else []
        
        print(f"  Total Sources: {len(sources)}")
        for src in sources:
            is_selected = "YES" if src.get("id") in selected_ids else "NO"
            print(f"  - [{is_selected}] {src.get('name')} (Type: {src.get('type')})")
            if src.get("type") == "mcp":
                print(f"    Config: {src.get('config')}")
                
        print("-" * 50)
        
    conn.close()

if __name__ == "__main__":
    get_kbs()
