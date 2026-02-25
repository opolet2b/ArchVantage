import sys
import os
import httpx
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.core.config import settings
from app.models.knowledge_graph import KnowledgeBaseConfig

def reset_arcadedb():
    print("--- Dropping ArcadeDB ---")
    host = os.getenv("ARCADEDB_HOST", settings.ARCADEDB_HOST).rstrip('/')
    user = os.getenv("ARCADEDB_USER", settings.ARCADEDB_USER)
    password = os.getenv("ARCADEDB_PASSWORD", settings.ARCADEDB_PASSWORD)
    db_name = os.getenv("ARCADEDB_DATABASE", settings.ARCADEDB_DATABASE)
    
    url = f"{host}/api/v1/server"
    auth = (user, password)
    
    try:
        with httpx.Client(auth=auth) as client:
            res = client.post(url, json={"command": f"drop database {db_name}"})
            print(f"ArcadeDB Drop Result: {res.status_code}")
    except Exception as e:
        print(f"Failed to drop ArcadeDB: {e}")

def reset_sqlite():
    print("--- Resetting SQLite Hashes ---")
    engine = create_engine(settings.DATABASE_URL)
    Session = sessionmaker(bind=engine)
    db = Session()
    try:
        updated = db.query(KnowledgeBaseConfig).update({
            "file_hashes": {},
            "node_count": 0,
            "edge_count": 0,
            "ingestion_status": "idle"
        })
        db.commit()
        print(f"Reset {updated} KB configs back to idle state.")
    except Exception as e:
        print(f"Failed to reset SQLite: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    reset_arcadedb()
    reset_sqlite()
    print("Done! ArcadeDB wiped and SQLite ingestion state reset.")
