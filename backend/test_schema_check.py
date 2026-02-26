import sys
import os
import requests
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.core.arcadedb import arcadedb

try:
    print("Testing types count...")
    res = requests.post(
        f"http://localhost:2480/api/v1/query/{arcadedb.db_name}",
        json={"language": "sql", "command": "SELECT name FROM schema:types"},
        auth=("root", "playwithdata")
    )
    if res.status_code != 200:
        print("Schema Query failed:", res.text)
    else:
        types = [r['name'] for r in res.json().get('result', [])]
        print("Types found:", types)
except Exception as e:
    print(e)
