import sqlite3
import json

try:
    conn = sqlite3.connect('canvases.db')
    cursor = conn.cursor()
    cursor.execute("SELECT id, summaries FROM things WHERE type='document' ORDER BY updated_at DESC LIMIT 1")
    row = cursor.fetchone()
    if row:
        print(f"Thing ID: {row[0]}")
        print(f"Summaries: {row[1]}")
    else:
        print("No document things found.")
except Exception as e:
    print(f"Error: {e}")
