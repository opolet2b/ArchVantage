import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.core.arcadedb import arcadedb

try:
    print("Fetching all vertices...")
    res = arcadedb.query("SELECT @type, count(*) FROM V GROUP BY @type")
    print(res)
    
    print("\nSample entities:")
    res_v = arcadedb.query("SELECT @rid, @type, name, graph_id FROM V LIMIT 10")
    for r in res_v.get("result", []):
        print(r)
        
except Exception as e:
    print(f"Error: {e}")
