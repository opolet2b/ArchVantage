import sqlite3
import json

db_path = r"C:\Users\opole\Downloads\ChatBotn\backend\db\sql_app.db"
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

print("--- TOOLS ---")
cursor.execute("SELECT id, name, tool_type, configuration FROM tools WHERE id = 7")
row = cursor.fetchone()
if row:
    t_id, name, t_type, config = row
    print(f"ID: {t_id}, Name: {name}, Type: {t_type}")
    print(f"Configuration: {config}")
    try:
        cfg = json.loads(config) if isinstance(config, str) else config
        print(f"Parsed Configuration keys: {list(cfg.keys()) if isinstance(cfg, dict) else 'not dict'}")
        if isinstance(cfg, dict):
            print(f"gui_schema: {cfg.get('gui_schema')}")
    except Exception as e:
        print(f"Error parsing config: {e}")
else:
    print("Tool ID 7 not found!")

conn.close()
