
import os
import sys
import asyncio
import sqlite3
import json
import shutil

# Add backend to path
sys.path.append(os.path.join(os.getcwd(), "backend"))

async def reindex_all_raw():
    print("=== ChromaDB Re-indexing Utility (ULTIMATE STABLE) ===")
    
    # 1. Mirror config
    if not os.path.exists("data"): os.makedirs("data", exist_ok=True)
    if os.path.exists("backend/data/config.json"):
        shutil.copy("backend/data/config.json", "data/config.json")

    # 2. Initialize RAG Service (Strict)
    from app.services.rag_service import rag_service
    from llama_index.core import Settings
    
    rag_service.persist_directory = "backend/chroma_db"
    rag_service.initialize()
    
    if not rag_service._initialized:
        print(f"CRITICAL ERROR: RAG Service failed to initialize: {rag_service.init_error}")
        return

    # 3. Connect to SQL DB
    db_path = "backend/db/sql_app.db"
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    root_dir = os.getcwd()
    
    try:
        cursor.execute("SELECT id, canvas_id, type, content, title FROM canvas_things WHERE type IN ('DOCUMENT', 'TEXT', 'CONVERSATION')")
        rows = cursor.fetchall()
        
        print(f"Found {len(rows)} items to re-index.")
        
        success_count = 0
        error_count = 0
        
        for row in rows:
            try:
                thing_id = row['id']
                canvas_id = row['canvas_id']
                thing_type = row['type']
                content = json.loads(row['content']) if isinstance(row['content'], str) else row['content']
                title = row['title']
                
                metadata = {"canvas_id": canvas_id, "thing_id": thing_id, "type": thing_type}
                res = {"status": "error"}
                
                if thing_type == 'DOCUMENT':
                    rel_path = content.get("file_path")
                    if rel_path:
                        # Try finding the file in several places
                        possible_paths = [
                            os.path.abspath(rel_path),
                            os.path.abspath(os.path.join("backend", rel_path)),
                            os.path.abspath(os.path.join(root_dir, rel_path)),
                            os.path.abspath(os.path.join(root_dir, "backend", rel_path))
                        ]
                        
                        found_path = None
                        for p in possible_paths:
                            if os.path.isfile(p):
                                found_path = p
                                break
                        
                        if found_path:
                            res = rag_service.ingest_file(found_path, metadata=metadata)
                        else:
                            res = {"status": "error", "error": f"File not found. Sample tried: {possible_paths[1]}"}
                    else: res = {"status": "error", "error": "No file_path"}
                        
                elif thing_type == 'TEXT':
                    text = content.get("text")
                    if text: res = rag_service.ingest_text(text, metadata=metadata)
                elif thing_type == 'CONVERSATION':
                    text = content.get("context") or title
                    if text: res = rag_service.ingest_text(text, metadata=metadata)
                
                if res.get("status") == "success":
                    success_count += 1
                    print(f"  [OK] {title or thing_id}")
                    cursor.execute("UPDATE canvas_things SET rag_status = 'completed' WHERE id = ?", (thing_id,))
                    conn.commit()
                else:
                    error_count += 1
                    err_msg = res.get("error") or res.get("message") or "Unknown error"
                    print(f"  [FAIL] {title or thing_id}: {err_msg}")
                
            except Exception as e:
                print(f"  ! Error indexing {row['id']}: {e}")
                error_count += 1
                
        print(f"\nRE-INDEXING COMPLETE. Success: {success_count}, Errors: {error_count}")
        
    finally:
        conn.close()

if __name__ == "__main__":
    asyncio.run(reindex_all_raw())
