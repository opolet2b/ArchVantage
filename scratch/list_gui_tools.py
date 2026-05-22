import sqlite3
import json

db_path = r"C:\Users\opole\Downloads\ChatBotn\backend\db\sql_app.db"
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

cursor.execute("SELECT id, name, tool_type, configuration FROM tools")
tools = cursor.fetchall()
print("Tools in DB:")
for t in tools:
    config_summary = ""
    if t[3]:
        try:
            config = json.loads(t[3])
            if isinstance(config, dict) and "components" in config:
                config_summary = f", {len(config['components'])} components"
            else:
                config_summary = f", config keys: {list(config.keys()) if isinstance(config, dict) else type(config)}"
        except Exception as e:
            config_summary = f", config parse error: {e}"
    print(f"  - ID {t[0]}: {t[1]} ({t[2]}){config_summary}")

conn.close()
