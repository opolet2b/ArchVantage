import sqlite3
import json

try:
    conn = sqlite3.connect("backend/db/sql_app.db")
    cursor = conn.cursor()
    cursor.execute("SELECT id, name, status, ingestion_status, ontology_classes FROM knowledge_base_configs ORDER BY id DESC LIMIT 1")
    row = cursor.fetchone()
    if row:
        print(f"ID: {row[0]}")
        print(f"Name: {row[1]}")
        classes = json.loads(row[4])
        print(f"Approved Classes: {[c['name'] for c in classes if c.get('approved')]}")
    conn.close()
except Exception as e:
    print(e)
