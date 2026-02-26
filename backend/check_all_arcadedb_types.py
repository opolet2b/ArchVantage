import sys
import os
import requests
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.core.arcadedb import arcadedb

try:
    print("Testing types count...")
    res = requests.get(
        f"http://localhost:2480/api/v1/query/{arcadedb.db_name}?command=SELECT name, records FROM system:types WHERE type=0",
        auth=("root", "playwithdata")
    )
    if res.status_code != 200:
        print("Query failed:", res.text)
    else:
        for rec in res.json().get("result", []):
            if rec.get("records", 0) > 0:
                print(f"{rec.get('name')}: {rec.get('records')} records")
except Exception as e:
    print(e)
