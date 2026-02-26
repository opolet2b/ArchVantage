import sys
import os
import json
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.core.arcadedb import arcadedb

try:
    res2 = arcadedb.query("SELECT FROM KNOWLEDGE_LINK LIMIT 15").get("result", [])
    
    output = []
    
    for e in res2:
        out_rid = e.get("@out")
        in_rid = e.get("@in")
        
        n_out = arcadedb.query(f"SELECT FROM {out_rid}").get("result", [])
        n_in = arcadedb.query(f"SELECT FROM {in_rid}").get("result", [])
        
        out_class = n_out[0].get("@class") if n_out else "Missing"
        in_class = n_in[0].get("@class") if n_in else "Missing"
        out_name = n_out[0].get("name") if n_out else "Missing"
        in_name = n_in[0].get("name") if n_in else "Missing"
        
        output.append({
            "rel": e.get('relation_type'),
            "out": f"{out_name} ({out_class})",
            "in": f"{in_name} ({in_class})"
        })
        
    with open("check_output.json", "w", encoding='utf-8') as f:
        json.dump(output, f, indent=2)
except Exception as e:
    with open("check_output.json", "w", encoding='utf-8') as f:
        f.write(str(e))
