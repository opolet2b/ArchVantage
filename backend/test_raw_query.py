import sys
import os
import requests
from collections import defaultdict
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.core.arcadedb import arcadedb

try:
    print("Testing basic V select...")
    res = requests.post(
        f"http://localhost:2480/api/v1/query/{arcadedb.db_name}",
        json={"language": "sql", "command": f"SELECT @type, graph_id FROM V LIMIT 1000"},
        auth=("root", "playwithdata")
    )
    if res.status_code != 200:
        print("V Query failed:", res.text)
        sys.exit(1)
        
    data = res.json().get("result", [])
    
    graph_ids = defaultdict(int)
    types = defaultdict(int)
    
    for node in data:
        gid = node.get("graph_id", "NO_GRAPH_ID")
        t = node.get("@type", "UNKNOWN_TYPE")
        graph_ids[gid] += 1
        types[t] += 1
        
    print(f"Total Entity nodes: {len(data)}")
    print(f"Graph IDs: {dict(graph_ids)}")
    print(f"Types: {dict(types)}")
    
    res_q = requests.post(
        f"http://localhost:2480/api/v1/query/{arcadedb.db_name}",
        json={"language": "sql", "command": f"SELECT FROM QuarantineEntity LIMIT 1000"},
        auth=("root", "playwithdata")
    )
    
    q_data = res_q.json().get("result", [])
    q_graph_ids = defaultdict(int)
    for node in q_data:
        gid = node.get("graph_id", "NO_GRAPH_ID")
        q_graph_ids[gid] += 1
        
    print(f"Total QuarantineEntity nodes: {len(q_data)}")
    print(f"Quarantine Graph IDs: {dict(q_graph_ids)}")

except Exception as e:
    import traceback
    traceback.print_exc()
