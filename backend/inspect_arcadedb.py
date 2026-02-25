import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.core.arcadedb import arcadedb

try:
    print("Connecting to ArcadeDB...")
    
    # Check what classes exist
    print("--- Database Schema ---")
    types = arcadedb.query("SELECT name FROM db_classes()").get("result", [])
    print(f"Total base types: {len(types)}")
    for t in types:
        if "@" not in t.get("name", "") and not t.get("name", "").startswith("O"):
            print(f"- {t.get('name')}")
            
    # Count V globally
    print("--- Global V Count ---")
    try:
        count_res = arcadedb.query("SELECT count(*) FROM V").get("result", [])
        print(count_res)
    except Exception as e:
        print(f"Error querying V: {e}")
        
    # Count specific entities known to be used
    print("--- known user types ---")
    try:
        count_res = arcadedb.query("SELECT count(*) FROM Entity").get("result", [])
        print(f"Entity count: {count_res}")
    except Exception:
        pass

except Exception as e:
    print(f"Script Error: {e}")
