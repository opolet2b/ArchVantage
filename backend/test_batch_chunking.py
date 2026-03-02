import asyncio
from app.services.ingestion_service import ingestion_service
from app.core.database import SessionLocal
from app.models.knowledge_graph import KnowledgeBaseConfig

async def test_ingestion():
    db = SessionLocal()
    # Find SwissEgov KB
    kbs = db.query(KnowledgeBaseConfig).filter(KnowledgeBaseConfig.name == "SwissEgov").all()
    if not kbs:
        print("KB not found")
        return
        
    kb = kbs[0]
    
    # Let's just process the URL from Swiss IT eGov
    target_sources = [s for s in kb.sources if "Swiss" in s.get("name", "")]
    if not target_sources:
        print("Source not found")
        return
        
    print(f"Triggering ingestion for {kb.id} with {len(target_sources)} sources")
    
    # We will use the 120B model for extraction as configured
    llm_preset = "OpenRouter GPT-OSS 120"
    
    # Hardcode paths to avoid full crawl time, or just run the actual ingestion
    await ingestion_service.discover_and_ingest_entities(
        kb_id=kb.id,
        ontology_classes=kb.ontology_classes,
        sources=target_sources,
        llm_config_id=llm_preset
    )
    
if __name__ == "__main__":
    asyncio.run(test_ingestion())
