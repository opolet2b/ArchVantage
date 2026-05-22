import sqlite3

db_path = r"C:\Users\opole\Downloads\ChatBotn\backend\db\sql_app.db"
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
tables = cursor.fetchall()
print("Tables in sql_app.db:")
for table in tables:
    print(f"  - {table[0]}")
    
# Let's inspect tools table columns if it exists
if ('tools',) in tables:
    print("\nColumns in tools table:")
    cursor.execute("PRAGMA table_info(tools)")
    for col in cursor.fetchall():
        print(f"  - {col[1]} ({col[2]})")
        
# Let's inspect categories if it exists
if ('categories',) in tables:
    print("\nColumns in categories table:")
    cursor.execute("PRAGMA table_info(categories)")
    for col in cursor.fetchall():
        print(f"  - {col[1]} ({col[2]})")

conn.close()
