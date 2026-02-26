import sys
import os
import asyncio
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.core.database import SessionLocal
from app.models.knowledge_graph import KnowledgeBaseConfig
from app.services.ingestion_service import IngestionService

async def main():
    db = SessionLocal()
    try:
        kb_id = "562bf03d-f18e-4419-95c4-760709105cc0"
        kb = db.query(KnowledgeBaseConfig).filter(KnowledgeBaseConfig.id == kb_id).first()
        if not kb:
            print("KB not found")
            return
            
        print(f"Sources: {len(kb.sources)}")
        classes = kb.ontology_classes or []
        approved_classes = [c for c in classes if c.get('approved') != False]
        print(f"Approved Classes: {len(approved_classes)}")
        
        # We don't want to actually re-call the LLM API right now, we want to know if ArcadeDB was failing silently.
        # But maybe the LLM simply didn't return anything?
        # But SQLite recorded "node_count: 44". This means `inserted_count` was 44.
        # Let's recreate ONE entity insertion with the exact sanitization logic.
        print("Testing single entity insertion logic...")
        
        from app.core.arcadedb import arcadedb
        import uuid
        import re
        import datetime
        
        raw_type = "Service Provider"
        ent_name = "Test Swiss System"
        ent_summary = "Test"
        ent_source = "Test"
        now_str = datetime.datetime.now().isoformat()
        ent_uid = f"ent-{uuid.uuid4().hex[:8]}"

        sanitized_type = re.sub(r'[^a-zA-Z0-9_]', '_', raw_type.replace(" ", "_"))
        # ent_type = sanitized_type
        ent_type = "Service_Provider"
        
        query = f"INSERT INTO `{ent_type}` SET uid = :uid, name = :name, summary = :summary, source_uri = :source, source_type = 'DOCUMENT', graph_id = :graph_id, last_synced = :now, sync_status = 'SYNCED' RETURN @rid"
        print(f"Executing: {query}")
        
        try:
            res = arcadedb.command(query, params={
                "uid": ent_uid,
                "name": ent_name,
                "summary": ent_summary,
                "source": ent_source,
                "graph_id": kb_id,
                "now": now_str
            })
            print(f"Success: {res}")
        except Exception as e:
            print(f"Exception: {e}")
            
    finally:
        db.close()

if __name__ == "__main__":
    asyncio.run(main())
