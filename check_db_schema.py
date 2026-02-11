import sqlite3

conn = sqlite3.connect('backend/canvas.db')
cursor = conn.cursor()

# Get all tables
cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
tables = cursor.fetchall()

print("Available tables:")
for table in tables:
    print(f"  - {table[0]}")

# Find template-related tables
template_tables = [t[0] for t in tables if 'template' in t[0].lower()]

if template_tables:
    print(f"\nTemplate-related tables: {template_tables}")
    
    for table_name in template_tables:
        print(f"\n{'='*80}")
        print(f"Table: {table_name}")
        cursor.execute(f"PRAGMA table_info({table_name})")
        columns = cursor.fetchall()
        print("Columns:")
        for col in columns:
            print(f"  - {col[1]} ({col[2]})")

conn.close()
