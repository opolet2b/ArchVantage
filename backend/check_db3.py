import sys
import os
import json
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.core.arcadedb import arcadedb

try:
    print("Fetching Node...")
    res = arcadedb.query("SELECT FROM Entity LIMIT 1").get("result", [])
    print(json.dumps(res, indent=2))
    
    print("Fetching Edge...")
    res2 = arcadedb.query("SELECT FROM KNOWLEDGE_LINK LIMIT 1").get("result", [])
    print(json.dumps(res2, indent=2))
except Exception as e:
    print(f"Error: {e}")
