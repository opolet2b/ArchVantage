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
        # This is harder because iterating *all* vectors is slow.
        # But we can query the collection if size is manageable.
        if rag_service._initialized and rag_service.chroma_collection:
            try:
                # Limit to first 10000 for sanity? Or get all IDs.
                # using get() with no args returns everything (metadata only is faster?)
                collection_data = rag_service.chroma_collection.get(include=["metadatas"])
                ids = collection_data["ids"]
                metadatas = collection_data["metadatas"]
                
                # We need to check if 'source' or 'asset_id' or 'canvas_id' is valid.
                # Valid Sources:
                # - existing assets (Asset ID or File Path)
                # - existing text things (Thing ID)
                # - existing conversations (Conversation ID)
                
                # Fetch all valid IDs for quick lookup
                valid_asset_ids = set(a.id for a in db_assets)
                
                # Things are harder. We check Thing IDs?
                # Usually RAG stores 'asset_id' in metadata if it's from an asset.
                # If it's a raw text node, it might have 'thing_id' (not consistently implemented yet).
                # Fallback: Check if 'source' exists as a file (if it's a file path).
                
                for i, meta in enumerate(metadatas):
                    is_orphan = False
                    reason = ""
                    
                    asset_id = meta.get("asset_id")
                    source = meta.get("source", "")
                    
                    if asset_id:
                        if asset_id not in valid_asset_ids:
                            is_orphan = True
                            reason = f"Asset {asset_id} does not exist"
                    elif "data_storage" in source or "data/uploads" in source:
                        # Check if file exists
                        if not os.path.exists(source):
                            is_orphan = True
                            reason = "Source file missing"
                            
                    if is_orphan:
                        results["embeddings"].append({
                            "id": ids[i],
                            "metadata": meta,
                            "reason": reason
                        })
                        results["stats"]["embeddings"] += 1

            except Exception as e:
                print(f"[Maintenance] Error scanning embeddings: {e}")
                
        return results

    def delete_orphans(self, db: Session, orphans: Dict[str, List[Any]]) -> Dict[str, int]:
        """
        Delete selected orphans.
        orphans input format: {"files": ["full/path/1"], "embeddings": ["id1", "id2"]}
        """
        deleted_count = {"files": 0, "embeddings": 0}
        
        # Delete Files
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

        # Delete Embeddings
        embedding_ids = orphans.get("embeddings", [])
        if embedding_ids and rag_service._initialized:
             try:
                 rag_service.chroma_collection.delete(ids=embedding_ids)
                 deleted_count["embeddings"] = len(embedding_ids)
             except Exception as e:
                 print(f"[Maintenance] Failed to delete embeddings: {e}")
                 
        return deleted_count

maintenance_service = MaintenanceService()
