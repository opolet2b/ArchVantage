import sys
import os
import requests
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.core.arcadedb import arcadedb

try:
    print("Testing Service_Provider select...")
    res = requests.post(
        f"http://localhost:2480/api/v1/query/{arcadedb.db_name}",
        json={"language": "sql", "command": f"SELECT FROM Service_Provider LIMIT 10"},
        auth=("root", "playwithdata")
    )
    if res.status_code != 200:
        print("Query failed:", res.text)
    else:
        print("Nodes found:", len(res.json().get("result", [])))
        print(res.json().get("result", []))
except Exception as e:
    print(e)
