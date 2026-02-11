import sqlite3
import json

conn = sqlite3.connect('backend/canvas.db')
cursor = conn.cursor()

cursor.execute("""
    SELECT id, name, pipeline_config 
    FROM templates 
    WHERE name LIKE '%Smart%' OR name LIKE '%Analy%'
""")

rows = cursor.fetchall()

for r in rows:
    print(f"\n{'='*80}")
    print(f"ID: {r[0]}")
    print(f"Name: {r[1]}")
    print(f"Config:")
    if r[2]:
        config = json.loads(r[2])
        print(json.dumps(config, indent=2))
    else:
        print("  (No config)")

conn.close()
