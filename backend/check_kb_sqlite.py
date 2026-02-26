import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.core.database import SessionLocal
from app.models.knowledge_graph import KnowledgeBaseConfig

db = SessionLocal()
try:
    kbs = db.query(KnowledgeBaseConfig).all()
    print(f"Total KBs: {len(kbs)}")
    for kb in kbs:
        print(f"ID: {kb.id}, Name: {kb.name}, Status: {kb.status}, Ingestion: {kb.ingestion_status}")
except Exception as e:
    print(e)
finally:
    db.close()
