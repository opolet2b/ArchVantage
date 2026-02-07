"""
Asset Router

API endpoints for managing file assets.
Handles uploading and secure streaming.

PEP 8 Compliant
"""
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException, status, BackgroundTasks
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.core.database import get_db
from app.routers.auth import get_current_active_user
from app.models.user import User
from app.services.asset_service import asset_service
from app.services.rag_service import rag_service
from app.services.pptx_service import pptx_service
import json

print("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!")
print("!!! ASSETS ROUTER LOADING - VERSION 5 (SIDECAR FIX) !!!")
print("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!")

router = APIRouter()


# =============================================================================
# Schemas
# =============================================================================

class AssetUploadResponse(BaseModel):
    id: str
    filename: str
    url: str
    mime_type: str
    size: int
    file_hash: str | None = None

# =============================================================================
# Endpoints
# =============================================================================

@router.post("/upload", response_model=AssetUploadResponse)
async def upload_asset(
    file: UploadFile,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Upload a file and create an asset record.
    Triggers asynchronous RAG ingestion.
    """
    try:
        asset, file_hash = await asset_service.create_asset(db, file, current_user.id)
        
        # Trigger Background RAG Ingestion
        # This fixes the "Sidebar Chat Hallucination" issue by ensuring standard uploads are vectorized.
        def ingest_asset_for_user(asset_id, file_path, user_id):
            try:
                print(f"[AssetRouter] Starting background ingestion for asset {asset_id}")
                
                # Metadata: Tag with asset_id and owner_id so the generic chat can find it
                result = rag_service.ingest_file(
                    file_path,
                    metadata={
                        "asset_id": asset_id, 
                        "owner_id": user_id, 
                        "source": "sidebar_upload"
                    }
                )
                print(f"[AssetRouter] Background ingestion finished: {result.get('status')}")
            except Exception as e:
                print(f"[AssetRouter] Background ingestion failed: {e}")

        # Resolve full path for ingestion
        full_path = str(asset_service.get_storage_path(asset))
        
        
        # Debug Extension Logic
        print(f"[AssetRouter] Upload complete. Checking for PPTX processing...")
        print(f"[AssetRouter] Asset ID: {asset.id}, Original Name: '{asset.original_name}'")
        
        filename = asset.original_name.lower().strip() # Added strip for safety
        if filename.endswith(".pptx"):
            print(f"[AssetRouter] MATCHED .pptx extension. Starting processing...")
            try:
                # We need the physical path. AssetService stores it. 
                # Resolve physical path correctly
                file_path = str(asset_service.get_storage_path(asset))
                
                # Process Structure
                structure = pptx_service.process_presentation(file_path)
                
                # Save Structure Metadata
                metadata_path = f"{file_path}.json"
                with open(metadata_path, "w") as f:
                    json.dump(structure, f)
                    
                print(f"[AssetRouter] Saved PPTX structure to {metadata_path}")
                
            except Exception as e:
                print(f"[AssetRouter] Failed to process PPTX: {e}")
                # Don't fail the upload, just log error

        background_tasks.add_task(ingest_asset_for_user, asset.id, full_path, current_user.id)
        
        return {
            "id": asset.id,
            "filename": asset.original_name,
            "size": asset.size_bytes,
            "file_hash": file_hash,  # Changed from "hash" to match frontend and schema
            "status": "processing"
        }
    except Exception as e:
        print(f"[Upload] Error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )




@router.get("/sidecar/{asset_id}")
async def get_asset_sidecar(
    asset_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Retrieve the JSON sidecar for an asset (e.g. PPTX structure).
    """
    # Verify ownership and get asset record
    from app.models.asset_models import Asset
    import os
    
    asset = db.query(Asset).filter(Asset.id == asset_id).first()
    if not asset:
         raise HTTPException(status_code=404, detail="Asset not found")
         
    if asset.owner_id != current_user.id:
         raise HTTPException(status_code=403, detail="Not authorized")
         
    file_path = asset_service.get_storage_path(asset)
    json_path = f"{file_path}.json"
    
    print(f"[AssetRouter-V2] Sidecar Request (Explicit Route). Asset: {asset.id}")
    print(f"[AssetRouter-V2] Looking for Sidecar at: {json_path}")
    
    if not os.path.exists(json_path):
        print(f"[AssetRouter-V2] Sidecar NOT FOUND.")
        raise HTTPException(status_code=404, detail="Sidecar JSON not found. The file may not have been processed yet.")
    
    print(f"[AssetRouter-V2] Sidecar FOUND.")
        
    return FileResponse(path=json_path, media_type="application/json", filename=f"{asset.original_name}.json")


@router.get("/{asset_id}")
async def get_asset(
    asset_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Stream a secure asset.
    Strictly verifies that current_user owns the asset.
    """
    file_path, media_type, filename = asset_service.get_asset_stream(
        db, asset_id, current_user.id
    )
    
    return FileResponse(
        path=file_path,
        media_type=media_type,
        filename=filename
    )



