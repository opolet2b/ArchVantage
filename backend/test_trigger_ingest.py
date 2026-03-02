import asyncio
from app.core.database import SessionLocal
from app.models.knowledge_graph import KnowledgeBaseConfig
from app.services.ingestion_service import ingestion_service

async def test_ingest():
    db = SessionLocal()
    kb_id = '562bf03d-f18e-4419-95c4-760709105cc0'
    db_kb = db.query(KnowledgeBaseConfig).filter(KnowledgeBaseConfig.id == kb_id).first()
    
    if not db_kb:
        print("KB not found")
        return
        
    print(f"Triggering ingestion for {db_kb.name}")
    
    # We leave the graph as is, and just re-ingest to see if new nodes get mapped correctly with URL
    # Or we can just count them before and after
    await ingestion_service.discover_and_ingest_entities(
        kb_id, 
        db_kb.ontology_classes, 
        db_kb.sources, 
        db_kb.llm_config_id
    )
    
    print("Ingestion complete")

if __name__ == "__main__":
    asyncio.run(test_ingest())
