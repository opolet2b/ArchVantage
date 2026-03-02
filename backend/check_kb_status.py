import sqlite3
import json

db_path = "./db/sql_app.db"

def check_sqlite():
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    cursor.execute("SELECT id, name, ingestion_status FROM knowledge_base_configs")
    rows = cursor.fetchall()
    
    for row in rows:
        print(f"ID: {row['id']}, Name: {row['name']}, Status: {row['ingestion_status']}")
        
    conn.close()

if __name__ == "__main__":
    check_sqlite()
