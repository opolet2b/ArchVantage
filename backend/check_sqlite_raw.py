import sqlite3

try:
    conn = sqlite3.connect("backend/db/sql_app.db")
    cursor = conn.cursor()
    cursor.execute("SELECT id, name, status, ingestion_status, node_count, edge_count FROM knowledge_base_configs ORDER BY id DESC")
    rows = cursor.fetchall()
    for row in rows:
        print(f"ID: {row[0]}, Name: {row[1]}, Status: {row[2]}, Ingestion: {row[3]}, Nodes: {row[4]}, Edges: {row[5]}")
    conn.close()
except Exception as e:
    print(e)
