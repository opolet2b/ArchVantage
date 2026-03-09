import sqlite3
import json

def get_kbs():
    conn = sqlite3.connect('backend/db/sql_app.db')
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    cursor.execute("SELECT id, name, status, sources, selected_source_ids FROM knowledge_base_configs")
    rows = cursor.fetchall()
    
    with open("kb_dump.json", "w") as f:
        data = []
        for row in rows:
            sources = json.loads(row['sources']) if row['sources'] else []
            selected_ids = json.loads(row['selected_source_ids']) if row['selected_source_ids'] else []
            data.append({
                "id": row['id'],
                "name": row['name'],
                "status": row['status'],
                "sources": sources,
                "selected_source_ids": selected_ids
            })
        json.dump(data, f, indent=2)

if __name__ == "__main__":
    get_kbs()
