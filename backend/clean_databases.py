import httpx
from app.core.arcadedb import arcadedb

def drop_dbs():
    server_url = f"{arcadedb.host.rstrip('/')}/api/v1/server"
    
    # Drop knowledge_graph main (if exists)
    try:
        res = httpx.post(server_url, auth=arcadedb.auth, json={"command": "drop database \"knowledge_graph main\""}, timeout=10.0)
        print("Drop 'knowledge_graph main':", res.status_code, res.text)
    except Exception as e:
        print("Error dropping bad db:", e)

    # Drop knowledge_graph (if exists)
    try:
        res = httpx.post(server_url, auth=arcadedb.auth, json={"command": "drop database knowledge_graph"}, timeout=10.0)
        print("Drop 'knowledge_graph':", res.status_code, res.text)
    except Exception as e:
        print("Error dropping clear db:", e)

if __name__ == "__main__":
    drop_dbs()
    print("\nAttempting to create it correctly now...")
    res = arcadedb.create_database()
    print("Create Database Result:", res)
