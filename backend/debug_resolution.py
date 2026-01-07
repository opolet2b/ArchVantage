import sys
import os
import asyncio

# Add current directory to sys.path to ensure 'app' module is found
sys.path.append(os.getcwd())

from app.core.database import SessionLocal
from app.models.asset_models import Asset
from app.services.asset_service import asset_service
from app.services.rag_service import rag_service
from llama_index.core import SimpleDirectoryReader

def debug_resolution():
    # Redirect logs to file
    log_file = open("debug_output.txt", "w", encoding="utf-8")
    
    def log(msg):
        print(msg)
        try:
            log_file.write(str(msg) + "\n")
            log_file.flush()
        except:
            pass

    db = SessionLocal()
    try:
        # Get the most recent PDF asset
        log("Querying for PDF asset...")
        asset = db.query(Asset).filter(Asset.mime_type.like("%pdf%")).order_by(Asset.created_at.desc()).first()
        
        if not asset:
            # Fallback to checking filename
            asset = db.query(Asset).filter(Asset.original_name.like("%pdf")).order_by(Asset.created_at.desc()).first()
        
        if not asset:
            log("No PDF assets found in DB.")
            return

        log(f"--- Asset Debug: {asset.original_name} (ID: {asset.id}) ---")
        log(f"DB File Path (relative): {asset.file_path}")
        
        # 1. Check Path Resolution
        resolved_path = asset_service.get_storage_path(asset)
        path_str = str(resolved_path)
        log(f"Resolved Path object: {resolved_path}")
        log(f"Resolved Path string: {path_str}")
        
        try:
            abs_path = resolved_path.resolve()
            log(f"Absolute Path: {abs_path}")
        except Exception as e:
            log(f"Failed to resolve absolute path: {e}")

        exists = os.path.exists(path_str)
        log(f"Exists on Disk: {exists}")
        
        if not exists:
            log("CRITICAL: File does not exist on disk!")
            return

        # 2. Check SimpleDirectoryReader (Direct Read)
        log("\n--- Testing SimpleDirectoryReader ---")
        try:
            # Use absolute path for reader
            abs_path_str = str(resolved_path.resolve())
            documents = SimpleDirectoryReader(input_files=[abs_path_str]).load_data()
            log(f"Reader returned {len(documents)} documents.")
            if documents:
                text = documents[0].text
                log(f"First doc text length: {len(text)}")
                log(f"Snippet: '{text[:100]}'")
                if not text.strip():
                    log("WARNING: Document text is empty! (Likely a scan)")
            else:
                log("Reader returned empty list.")
        except Exception as e:
            log(f"SimpleDirectoryReader FAILED: {e}")

        # Check RAG Search (Metadata Filter)
        log("\n--- Testing RAG Search ---")
        try:
            rag_service._initialize_rag() 
            # Attempt Search with Relative Path
            log(f"Searching with filter source='{path_str}'")
            results = rag_service.search(query="", k=5, filters={"source": path_str})
            log(f"RAG returned {len(results)} results (Relative Path).")
            
            if results:
                # Inspect content
                for i, res in enumerate(results):
                    txt = res.get('text', '')
                    log(f"Result {i} text length: {len(txt)}")
                    log(f"Result {i} snippet: '{txt[:50]}'")
                    if not txt.strip():
                        log(f"Result {i} is EMPTY.")
            
        except Exception as e:
            log(f"RAG Search FAILED: {e}")

    finally:
        db.close()
        log_file.close()

if __name__ == "__main__":
    debug_resolution()
