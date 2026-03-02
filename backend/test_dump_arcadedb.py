from app.core.arcadedb import arcadedb
import json

def investigate_db():
    print("--- Testing ArcadeDB Connection ---")
    
    # 1. Look at Vertex Classes
    print("\n--- Vertex Types ---")
    try:
        res = arcadedb.query("SELECT name FROM schema:types", silent=True)
        types = [r.get("name") for r in res.get("result", [])]
        print("Types found:", types)
    except Exception as e:
        print("Error fetching types:", e)

    # 2. Look at first 5 entities
    print("\n--- Sample Vertices ---")
    try:
        # Entity is the base inheritance type for all vertices we created
        res = arcadedb.query("SELECT FROM Entity LIMIT 5", silent=True)
        vertices = res.get("result", [])
        for v in vertices:
            print(json.dumps(v, indent=2))
            
    except Exception as e:
        print("Error fetching vertices:", e)

    # 3. Look at first 5 edges
    print("\n--- Sample Edges ---")
    try:
        res = arcadedb.query("SELECT FROM KNOWLEDGE_LINK LIMIT 5", silent=True)
        edges = res.get("result", [])
        for e in edges:
            print(json.dumps(e, indent=2))
            
    except Exception as e:
        print("Error fetching edges:", e)

if __name__ == "__main__":
    investigate_db()
