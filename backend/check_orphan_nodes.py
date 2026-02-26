import sys
import os
import requests
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from app.core.arcadedb import arcadedb

try:
    print("Fetching nodes with NO_GRAPH_ID or empty graph_id...")
    res = requests.post(
        f"http://localhost:2480/api/v1/query/{arcadedb.db_name}",
        json={"language": "sql", "command": "SELECT @type, name, graph_id, summary FROM Entity LIMIT 50"},
        auth=("root", "playwithdata")
    )
    if res.status_code == 200:
        data = res.json().get("result", [])
        for n in data:
            if n.get("graph_id") == "NO_GRAPH_ID" or not n.get("graph_id"):
                print(f"Type: {n.get('@type')}, Name: {n.get('name')}, GraphID: {n.get('graph_id')}")
    else:
         print("Failed", res.text)
except Exception as e:
    print(e)
