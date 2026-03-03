import asyncio
import os
from pprint import pprint
# Ensure DB directory paths are correct
os.environ["CHROMA_DB_DIR"] = r"C:\Users\opole\Downloads\ChatBotn\backend\chroma_db"

from app.core.database import SessionLocal
from app.services.context_enrichment_service import context_enrichment_service

async def test():
    db = SessionLocal()
    # We need an active KB ID. Let's list some.
    from app.models.knowledge_graph import KnowledgeBaseConfig
    kbs = db.query(KnowledgeBaseConfig).filter(KnowledgeBaseConfig.status == "active").all()
    if not kbs:
        print("No active KBs found.")
        return
        
    kb_id = kbs[0].id
    print(f"Testing with KB: {kbs[0].name} ({kb_id})")

    # Ask a question that requires semantic routing (e.g. in French)
    query = "Quelles sont les institutions bancaires mentionnées dans le document ?"
    print(f"\n--- Testing Semantic Enrichment ---")
    print(f"Query: {query}")
    
    context = await context_enrichment_service.enrich_context(query, kb_id, db)
    print("\n--- Context Returned ---")
    print(context[:1000] + "..." if len(context) > 1000 else context)

if __name__ == "__main__":
    asyncio.run(test())
