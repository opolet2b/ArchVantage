import sqlite3
import json

db_path = r"C:\Users\opole\Downloads\ChatBotn\backend\db\sql_app.db"
try:
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    cursor.execute("SELECT id, name, status, ingestion_status, node_count, edge_count, ontology_classes FROM knowledge_base_configs ORDER BY id DESC LIMIT 1")
    row = cursor.fetchone()
    if row:
        print(f"ID: {row[0]}")
        print(f"Name: {row[1]}")
        print(f"Status: {row[2]}, Ingestion: {row[3]}")
        print(f"Nodes: {row[4]}, Edges: {row[5]}")
        classes = json.loads(row[6])
        print(f"Classes: {[c['name'] for c in classes if c.get('approved')]}")
    conn.close()
except Exception as e:
    print(e)
