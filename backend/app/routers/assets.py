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
