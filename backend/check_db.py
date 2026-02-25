import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.core.arcadedb import arcadedb

kb_id = '562bf03d-f18e-4419-95c4-760709105cc0'

print("Checking classes in DB...")
try:
    types = arcadedb.query("SELECT name FROM db_classes()").get("result", [])
    custom_types = [t.get("name") for t in types if t.get("name") and not t.get("name").startswith("O") and not t.get("name").startswith("_") and t.get("name") not in ["V", "E"]]
    print(f"Custom Types: {custom_types}")
    
    for c in custom_types:
        try:
            count = arcadedb.query(f"SELECT count(*) FROM `{c}`").get("result", [])
            matches = arcadedb.query(f"SELECT count(*) FROM `{c}` WHERE graph_id = '{kb_id}'").get("result", [])
            print(f"- {c}: Total={count}, Matching KB={matches}")
            
            # Print sample to see exact structure
            sample = arcadedb.query(f"SELECT FROM `{c}` LIMIT 1").get("result", [])
            if sample:
                print(f"  Sample: {sample[0]}")
        except Exception as e:
            print(f"- {c}: Error {e}")
            
except Exception as e:
    print(f"Error checking classes: {e}")
