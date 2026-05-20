import sqlite3
import os

db_path = r"c:\Users\opole\Downloads\ChatBotn\backend\chroma_db\chroma.sqlite3"

if not os.path.exists(db_path):
    print(f"File not found: {db_path}")
else:
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
    tables = cursor.fetchall()
    print("Tables in chroma.sqlite3:")
    for t in tables:
        print(f"- {t[0]}")
    
    # Check for tenants table if it exists
    try:
        cursor.execute("SELECT * FROM tenants")
        tenants = cursor.fetchall()
        print(f"Tenants: {tenants}")
    except Exception as e:
        print(f"Error reading tenants: {e}")
        
    conn.close()
