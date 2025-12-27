"""
Asset Router

API endpoints for managing file assets.
Handles uploading and secure streaming.

PEP 8 Compliant
"""
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.core.database import get_db
from app.routers.auth import get_current_active_user
from app.models.user import User
from app.services.asset_service import asset_service
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


# =============================================================================
# Endpoints
# =============================================================================

@router.post("/upload", response_model=AssetUploadResponse)
async def upload_asset(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Upload a file to secure storage.
    Returns the asset ID and access URL.
    """
    print(f"[AssetRouter] Upload request received")
    if not file:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No file provided"
        )

    # Use service to handle storage logic
    asset = await asset_service.create_asset(db, file, current_user.id)
    
    # Check for PowerPoint
    filename = asset.original_name.lower()
    if filename.endswith(".pptx"):
        print(f"[AssetRouter] Detected PowerPoint file. Processing structure...")
        try:
            # We need the physical path. AssetService stores it. 
            # Assuming asset_service returns an asset object which might map to a file path 
            # or we need to reconstruct it. 
            # Looking at asset_service usage in get_asset, it seems we can get path.
            # But here we just created it. 
            # Let's assume standard uploads folder structure: data/uploads/{conversation_id? no, raw}/...
            # A safer way is to ask asset_service or just re-open the saved file if we know where it is.
            # Let's peek at AssetService implementation if needed, or just guess standard path:
            # "data/secure/{asset_id}" or similar.
            
            # Resolve physical path correctly
            file_path = str(asset_service.get_storage_path(asset))
            
            # Process Structure
            structure = pptx_service.process_presentation(file_path)
            
            # Save Structure Metadata
            metadata_path = f"{file_path}.json"
            with open(metadata_path, "w") as f:
                json.dump(structure, f)
                
            print(f"[AssetRouter] Saved PPTX structure to {metadata_path}")
            
            # Phase 2: AI Vectorization
            # Optimization: We defer RAG ingestion to the canvas/creation step (Background Task)
            # to avoid blocking the upload endpoint (timeouts).
            # The 'create_thing' endpoint will trigger the worker.
            pass
            
        except Exception as e:
            print(f"[AssetRouter] Failed to process PPTX: {e}")
            # Don't fail the upload, just log error

    
    # Construct access URL
    # Assuming standard API prefix /api/v1
    # URL will be relative for frontend use: /api/v1/assets/{id}
    access_url = f"/api/v1/assets/{asset.id}"
    
    return AssetUploadResponse(
        id=asset.id,
        filename=asset.original_name,
        url=access_url,
        mime_type=asset.mime_type,
        size=asset.size_bytes
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



