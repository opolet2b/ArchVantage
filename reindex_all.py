
import os
import sys
import asyncio

# Add backend to path
sys.path.append(os.path.join(os.getcwd(), "backend"))

async def reindex_all():
    print("=== ChromaDB Re-indexing Utility (Streamlined) ===")
    
    # 1. Initialize RAG Service first (this loads models internally)
    from app.services.rag_service import rag_service
    print("Initializing RAG Service...")
    rag_service.initialize()
    
    if not rag_service._initialized:
        print("Error: Could not initialize RAG service.")
        return

    # 2. Defer model/db imports until after Service is ready
    from app.core.database import SessionLocal
    from app.models.canvas_models import CanvasThing, ThingType
    
    db = SessionLocal()
    try:
        types_to_index = [ThingType.DOCUMENT, ThingType.TEXT, ThingType.CONVERSATION]
        things = db.query(CanvasThing).filter(CanvasThing.type.in_(types_to_index)).all()
        
        print(f"Found {len(things)} items to re-index.")
        
        success_count = 0
        error_count = 0
        
        for thing in things:
            try:
                metadata = {
                    "canvas_id": thing.canvas_id,
                    "thing_id": thing.id,
                    "type": thing.type.value
                }
                
                if thing.type == ThingType.DOCUMENT:
                    file_path = thing.content.get("file_path")
                    if file_path and os.path.exists(file_path):
                        res = rag_service.ingest_file(file_path, metadata=metadata)
                        if res.get("status") == "success": success_count += 1
                        else: error_count += 1
                    else:
                        error_count += 1
                        
                elif thing.type == ThingType.TEXT:
                    text = thing.content.get("text")
                    if text:
                        res = rag_service.ingest_text(text, metadata=metadata)
                        if res.get("status") == "success": success_count += 1
                        else: error_count += 1
                        
                elif thing.type == ThingType.CONVERSATION:
                    text = thing.content.get("context") or thing.title
                    if text:
                        res = rag_service.ingest_text(text, metadata=metadata)
                        if res.get("status") == "success": success_count += 1
                        else: error_count += 1
                
                print(f"[{thing.type}] Indexed: {thing.title or thing.id} (Total Success: {success_count})")
                
                # Update RAG status in DB
                thing.rag_status = "completed"
                db.commit()
                
            except Exception as e:
                print(f"  ! Error indexing {thing.id}: {e}")
                error_count += 1
                
        print(f"\nRE-INDEXING COMPLETE.")
        print(f"Success: {success_count}")
        print(f"Errors: {error_count}")
        
    finally:
        db.close()

if __name__ == "__main__":
    asyncio.run(reindex_all())
