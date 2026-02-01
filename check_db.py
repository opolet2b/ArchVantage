import sqlite3
import json
import os

conn = sqlite3.connect('backend/db/sql_app.db')
cur = conn.cursor()

# First list all tables
cur.execute("SELECT name FROM sqlite_master WHERE type='table'")
tables = [r[0] for r in cur.fetchall()]
print("All tables:")
for t in tables:
    print(f"  - {t}")

# Find any table with structure column
print("\n\nTables with 'structure' column:")
for t in tables:
    cur.execute(f"PRAGMA table_info('{t}')")
    cols = [c[1] for c in cur.fetchall()]
    if 'structure' in cols:
        print(f"\n=== {t} has 'structure' column ===")
        print(f"All columns: {cols}")
        
        # Get first row
        cur.execute(f"SELECT * FROM '{t}' LIMIT 1")
        row = cur.fetchone()
        if row:
            struct_idx = cols.index('structure')
            name_idx = cols.index('name') if 'name' in cols else 0
            print(f"Name: {row[name_idx]}")
            
            struct_data = row[struct_idx]
            if struct_data:
                os.makedirs('backend/debug_docs', exist_ok=True)
                with open('backend/debug_docs/template_structure.json', 'w', encoding='utf-8') as f:
                    f.write(struct_data if isinstance(struct_data, str) else json.dumps(struct_data))
                print(f"Structure saved to backend/debug_docs/template_structure.json")
                print(f"\nStructure preview: {str(struct_data)[:1500]}...")
        
conn.close()
