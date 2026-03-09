import asyncio
import os
import sys

# Add backend directory to sys.path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), 'backend')))

from app.core.database import SessionLocal
from app.services.context_enrichment_service import context_enrichment_service
from app.models.knowledge_graph import KnowledgeBaseConfig

async def test_enrichment():
    db = SessionLocal()
    try:
        # Get the first active KB with MCP sources
        kb = db.query(KnowledgeBaseConfig).filter(KnowledgeBaseConfig.status == "active").first()
        if not kb:
            print("No active KB found. Please configure one in the UI first.")
            return

        print(f"Testing Enrichment with KB: {kb.name} ({kb.id})")
        
        # Test query that should trigger an API if configured
        query = "Show me the latest user data or perform search via API"
        
        print(f"Executing query: '{query}'")
        context, citations = await context_enrichment_service.enrich_context(
            query=query, 
            kb_id=kb.id, 
            db=db
        )
        
        print("\n--- ENRICHMENT RESULT ---")
        print(f"Context Length: {len(context)}")
        print(f"Citations: {len(citations)}")
        if citations:
            print("Citation Types:", [c.get("type") for c in citations])
            
    except Exception as e:
        print(f"Error: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    asyncio.run(test_enrichment())
