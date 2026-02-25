import sys
import os
import json
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.core.arcadedb import arcadedb

try:
    print("Fetching Edge sample...")
    res2 = arcadedb.query("SELECT FROM KNOWLEDGE_LINK LIMIT 5").get("result", [])
    print(json.dumps(res2, indent=2))

    print("\nFetching connected nodes...")
    for e in res2:
        out_rid = e.get("@out")
        in_rid = e.get("@in")
        
        n_out = arcadedb.query(f"SELECT FROM {out_rid}").get("result", [])
        n_in = arcadedb.query(f"SELECT FROM {in_rid}").get("result", [])
        
        out_class = n_out[0].get("@class") if n_out else "Missing"
        in_class = n_in[0].get("@class") if n_in else "Missing"
        out_name = n_out[0].get("name") if n_out else "Missing"
        in_name = n_in[0].get("name") if n_in else "Missing"
        
        print(f"Edge {e.get('relation_type')}: {out_name} ({out_class}) -> {in_name} ({in_class})")
        
except Exception as e:
    print(f"Error: {e}")
