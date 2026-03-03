import asyncio
import os

# Ensure DB directory paths are correct
os.environ["CHROMA_DB_DIR"] = r"C:\Users\opole\Downloads\ChatBotn\backend\chroma_db"

from app.core.database import SessionLocal
from app.services.rag_service import rag_service

async def embed_ontology():
    db = SessionLocal()
    from app.models.knowledge_graph import KnowledgeBaseConfig
    kbs = db.query(KnowledgeBaseConfig).filter(KnowledgeBaseConfig.status == "active").all()
    
    if not kbs:
        print("No active KBs found.")
        return
        
    kb = kbs[0]
    kb_id = kb.id
    print(f"Embedding Ontology for KB: {kb.name} ({kb_id})")
    
    classes = kb.ontology_classes or []
    
    for cls in classes:
        cls_name = cls.get("name", "Unknown")
        cls_desc = cls.get("description", "")
        ontology_text = f"Knowledge Base Ontology Class: {cls_name}. Description: {cls_desc}"
        v_meta = {
            "kb_id": kb_id,
            "type": "ontology_class",
            "class_name": cls_name
        }
        try:
            rag_service.ingest_text(ontology_text, metadata=v_meta)
            print(f"Successfully embedded: {cls_name}")
        except Exception as ve:
            print(f"Failed to vectorize ontology class {cls_name}: {ve}")

if __name__ == "__main__":
    asyncio.run(embed_ontology())
