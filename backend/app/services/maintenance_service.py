"""
Maintenance Service

Handles system maintenance tasks such as:
- Scanning for orphaned files (data_storage vs Assets table)
- Scanning for orphaned embeddings (ChromaDB vs Asset/CanvasThing tables)
- Cleaning up identified orphans

PEP 8 Compliant
"""
import os
from pathlib import Path
from typing import List, Dict, Any
from sqlalchemy.orm import Session
from app.models.asset_models import Asset
from app.models.canvas_models import CanvasThing
from app.services.asset_service import STORAGE_ROOT
from app.services.rag_service import rag_service

class MaintenanceService:
    def scan_orphans(self, db: Session) -> Dict[str, Any]:
        """
        Scan for orphaned data.
        Returns a summary of found orphans.
        """
        results = {
            "files": [],
            "embeddings": [],
            "stats": {"files": 0, "embeddings": 0, "total_size_mb": 0.0}
        }
        
        # 1. Scan for Orphaned Files
        # List all physical files in data_storage
        physical_files = []
        for root, _, files in os.walk(STORAGE_ROOT):
            for file in files:
                full_path = Path(os.path.join(root, file))
                # Skip sidecar JSONs for now (they are deleted with the main file)
                if file.endswith(".json"):
                     continue
                
                # Get relative path to match DB format (e.g. 2023/12/21/uuid_name)
                # But Asset DB stores relative path depending on OS separator? 
                # AssetService uses / separator internally hopefully or os.path.join
                
                try:
                    rel_path = full_path.relative_to(STORAGE_ROOT)
                    # Force forward slashes for comparison if DB uses them (usually standard)
                    str_path = str(rel_path).replace("\\", "/") 
                    physical_files.append({
                        "path": str_path,
                        "full_path": str(full_path),
                        "size": full_path.stat().st_size
                    })
                except Exception as e:
                    print(f"[Maintenance] Error processing file {file}: {e}")

        # Get all Asset paths from DB
        db_assets = db.query(Asset).all()
        # Normalize DB paths
        db_paths = set(a.file_path.replace("\\", "/") for a in db_assets)
        
        # Identify Orphans
        for p_file in physical_files:
            if p_file["path"] not in db_paths:
                results["files"].append(p_file)
                results["stats"]["files"] += 1
                results["stats"]["total_size_mb"] += p_file["size"] / (1024 * 1024)

        # 2. Scan for Orphaned Embeddings (RAG)
        # We use direct SQLite access to avoid initializing the heavy ChromaDB client
        # which would hang on massive datasets (e.g. 44GB).
        try:
            import sqlite3
            
            # Reliable Path Discovery relative to this file
            # This file is in backend/app/services/
            # DB is in backend/chroma_db/
            current_dir = os.path.dirname(os.path.abspath(__file__)) # .../backend/app/services
            app_dir = os.path.dirname(current_dir)                     # .../backend/app
            backend_dir = os.path.dirname(app_dir)                     # .../backend
            chroma_db_path = os.path.join(backend_dir, "chroma_db", "chroma.sqlite3")
            
            if not os.path.exists(chroma_db_path):
                 # Fallback: maybe we are just in "app/services"?
                 # Try finding "backend" root
                 pass # path check below will handle it
            
            if chroma_db_path:
                # Connect with timeout to avoid locking issues, but read-only mostly
                conn = sqlite3.connect(chroma_db_path, timeout=5)
                cursor = conn.cursor()
                
                # Total count
                cursor.execute('SELECT COUNT(*) FROM embeddings')
                total_count = cursor.fetchone()[0]
                
                # Count with canvas_id
                cursor.execute('SELECT COUNT(DISTINCT id) FROM embedding_metadata WHERE key = "canvas_id"')
                with_canvas = cursor.fetchone()[0]
                
                # Count with conversation_id
                cursor.execute('SELECT COUNT(DISTINCT id) FROM embedding_metadata WHERE key = "conversation_id"')
                with_convo = cursor.fetchone()[0]
                
                # Unlabelled orphans (no canvas, no convo)
                # Note: This is an approximation of bloat
                cursor.execute('''
                    SELECT COUNT(*) FROM embeddings 
                    WHERE id NOT IN (SELECT id FROM embedding_metadata WHERE key IN ("canvas_id", "conversation_id"))
                ''')
                unlabelled_orphans = cursor.fetchone()[0]
                conn.close()
                
                results["stats"]["embeddings"] = unlabelled_orphans
                results["stats"]["total_embeddings"] = total_count
                results["stats"]["labelled_embeddings"] = with_canvas + with_convo
                
                if unlabelled_orphans > 0:
                    results["embeddings_summary"] = {
                        "unlabelled_count": unlabelled_orphans,
                        "is_huge": unlabelled_orphans > 50000
                    }
            else:
                 # No DB file found
                 results["stats"]["embeddings"] = 0
                
        except Exception as e:
            print(f"[Maintenance] Error scanning embeddings: {e}")
            # Do not fail the whole scan, just report error in log
                
        return results

    def delete_orphans(self, db: Session, orphans: Dict[str, Any]) -> Dict[str, int]:
        """
        Delete selected orphans.
        orphans input format: {
            "files": ["full/path/1"], 
            "embeddings": ["id1", "id2"],
            "purge_unlabelled": bool (Custom flag for bulk deep clean)
        }
        """
        deleted_count = {"files": 0, "embeddings": 0}
        
        # 1. Delete Files
        for file_path in orphans.get("files", []):
            try:
                p = Path(file_path)
                if p.exists() and STORAGE_ROOT in p.parents: # Security check: must be in storage
                    p.unlink()
                    deleted_count["files"] += 1
                    
                    # Also delete sidecar
                    sidecar = p.parent / (p.name + ".json")
                    if sidecar.exists():
                        sidecar.unlink()
                        
            except Exception as e:
                print(f"[Maintenance] Failed to delete {file_path}: {e}")

        # 2. Delete Specific Embeddings (by ID)
        embedding_ids = orphans.get("embeddings", [])
        if embedding_ids and rag_service._initialized:
             try:
                 print(f"[Maintenance] Deleting {len(embedding_ids)} specific embeddings...")
                 rag_service.chroma_collection.delete(ids=embedding_ids)
                 deleted_count["embeddings"] += len(embedding_ids)
             except Exception as e:
                 print(f"[Maintenance] Failed to delete specific embeddings: {e}")

        print(f"[Maintenance] Cleanup Request: orphans={orphans}")
        
        # 3. Deep Clean: Purge All Unlabelled
        # We use direct SQLite deletion for massive datasets to avoid loading the index
        if orphans.get("purge_unlabelled"):
            print("[Maintenance] PURGE_UNLABELLED flag is TRUE. Initiating Deep Clean...")
            try:
                import sqlite3
                
                # Reliable Path Discovery relative to this file
                current_dir = os.path.dirname(os.path.abspath(__file__)) # .../backend/app/services
                app_dir = os.path.dirname(current_dir)                     # .../backend/app
                backend_dir = os.path.dirname(app_dir)                     # .../backend
                chroma_db_path = os.path.join(backend_dir, "chroma_db", "chroma.sqlite3")

                print(f"[Maintenance] Starting Deep Clean of unlabelled embeddings (Offline Mode)... Path target: {chroma_db_path}")

                print(f"[Maintenance] Starting Deep Clean of unlabelled embeddings (Offline Mode)... Path found: {chroma_db_path}")
                
                if chroma_db_path:
                    conn = sqlite3.connect(chroma_db_path, timeout=30) # Longer timeout for heavy verify
                    cursor = conn.cursor()
                    
                    # 1. Identify valid IDs (Safety Step)
                    cursor.execute('''
                        CREATE TEMPORARY TABLE valid_ids AS
                        SELECT DISTINCT id FROM embedding_metadata 
                        WHERE key IN ("canvas_id", "conversation_id")
                    ''')
                    
                    # 2. Delete invalid metadata
                    print("[Maintenance] Purging orphaned metadata...")
                    cursor.execute("DELETE FROM embedding_metadata WHERE id NOT IN (SELECT id FROM valid_ids)")
                    deleted_meta = cursor.rowcount
                    
                    # 3. Delete invalid embeddings
                    print("[Maintenance] Purging orphaned embeddings...")
                    cursor.execute("DELETE FROM embeddings WHERE id NOT IN (SELECT id FROM valid_ids)")
                    deleted_embeddings = cursor.rowcount
                    
                    # 4. Commit Deletion
                    conn.commit()
                    print(f"[Maintenance] Purged {deleted_embeddings} embeddings. Committing changes...")
                    
                    # 5. Rebuild FTS Index (Crucial for reclaiming space from text index)
                    try:
                        print("[Maintenance] Rebuilding Full Text Search index...")
                        conn.execute("INSERT INTO embedding_fulltext_search(embedding_fulltext_search) VALUES('rebuild')")
                        conn.commit()
                    except Exception as fts_error:
                        print(f"[Maintenance] Warning: Could not rebuild FTS index (might not exist): {fts_error}")

                    # 6. Vacuum (Must be outside transaction in some modes, or just separate step)
                    print("[Maintenance] Vacuuming database to reclaim disk space (this may take a while)...")
                    # Re-connect to ensure clean state for Vacuum
                    conn.close()
                    conn = sqlite3.connect(chroma_db_path, timeout=300) # High timeout for vacuum
                    conn.execute("VACUUM")
                    conn.close()
                    
                    deleted_count["embeddings"] += deleted_embeddings
                    print(f"[Maintenance] Deep Clean finished successfully.")
                
            except Exception as e:
                print(f"[Maintenance] Failed during Deep Clean: {e}")
                import traceback
                traceback.print_exc()
                 
        return deleted_count

maintenance_service = MaintenanceService()
