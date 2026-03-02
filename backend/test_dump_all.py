from app.core.arcadedb import arcadedb
import json

def investigate_all():
    print("--- Searching for any vertices ---")
    try:
        # Get all types
        res = arcadedb.query("SELECT name FROM schema:types", silent=True)
        types = [r.get("name") for r in res.get("result", [])]
        
        total_nodes = 0
        for t in types:
            if t in ["OUser", "ORole", "OSequence"]: continue # system types
            try:
                # Query 1 from each custom type just to see
                res2 = arcadedb.query(f"SELECT FROM `{t}` LIMIT 2", silent=True)
                items = res2.get("result", [])
                if items:
                    print(f"\nFound {len(items)} items in type {t}:")
                    for item in items:
                        print(json.dumps(item, indent=2))
                        total_nodes += 1
            except Exception:
                pass
                
        if total_nodes == 0:
            print("\nABSOLUTELY NO NODES FOUND IN DATABASE!")
            
    except Exception as e:
        print("Error fetching types:", e)

if __name__ == "__main__":
    investigate_all()
