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
        
        # Reset count for test
        kb.node_count = 0
        kb.edge_count = 0
        db.commit()
        
        service = IngestionService()
        print("Starting ingestion...")
        await service.discover_and_ingest_entities(
            kb_id=kb.id,
            ontology_classes=approved_classes,
            sources=kb.sources,
            llm_config_id=kb.llm_config_id or "default"
        )
        print("Ingestion complete.")
        
    finally:
        db.close()

if __name__ == "__main__":
    asyncio.run(main())
