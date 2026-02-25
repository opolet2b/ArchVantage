import httpx
import sys, os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from app.core.database import SessionLocal
from app.models.knowledge_graph import KnowledgeBaseConfig
from app.core.config import settings

def reset_all():
    # Drop Database
    print("Dropping ArcadeDB...")
    host = os.getenv("ARCADEDB_HOST", settings.ARCADEDB_HOST).rstrip('/')
    user = os.getenv("ARCADEDB_USER", settings.ARCADEDB_USER)
    password = os.getenv("ARCADEDB_PASSWORD", settings.ARCADEDB_PASSWORD)
    db_name = os.getenv("ARCADEDB_DATABASE", settings.ARCADEDB_DATABASE)
    
    url = f"{host}/api/v1/server"
    auth = (user, password)
    
    with httpx.Client(auth=auth) as client:
        try:
            res = client.post(url, json={"command": f"drop database {db_name}"})
            print(f"ArcadeDB Drop Result: {res.status_code}")
        except Exception as e:
            print(f"ArcadeDB drop warning: {e}")
            
    # Re-init schema
    try:
        from app.models.knowledge_graph import init_knowledge_graph_schema
        init_knowledge_graph_schema()
        print("Schema re-initialized.")
    except Exception as e:
        print(f"Failed to init schema: {e}")
        
    db = SessionLocal()
    kb = db.query(KnowledgeBaseConfig).first()
    if kb:
        kb.file_hashes = {}
        kb.ingestion_status = "idle"
        kb.node_count = 0
        kb.edge_count = 0
        db.commit()
        print(f"Reset {kb.name} ({kb.id}) hashes and metrics.")
    db.close()

if __name__ == "__main__":
    reset_all()

