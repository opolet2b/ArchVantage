import sqlite3
import json

def check():
    try:
        conn = sqlite3.connect('C:/Users/opole/Downloads/ChatBotn/backend/db/sql_app.db')
        c = conn.cursor()
        c.execute("SELECT config_data FROM app_config ORDER BY id DESC LIMIT 1")
        row = c.fetchone()
        if row:
            data = json.loads(row[0])
            print("Config Data:", json.dumps(data.get("editor", {}), indent=2))
        else:
            print("No config found in db.")
    except Exception as e:
        print("Error:", e)

if __name__ == '__main__':
    check()
