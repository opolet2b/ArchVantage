import sqlite3
import json

try:
    conn = sqlite3.connect('db/sql_app.db')
    cursor = conn.cursor()
    cursor.execute("SELECT content, summaries FROM canvas_things WHERE type LIKE '%doc%' ORDER BY updated_at DESC LIMIT 1")
    row = cursor.fetchone()
    if row:
        content = json.loads(row[0])
        print(f"File Path: {content.get('file_path')}")
        print(f"Asset ID: {content.get('asset_id')}")
        print(f"Summaries: {row[1]}")
    else:
        print("No document found.")
except Exception as e:
    print(f"Error: {e}")
