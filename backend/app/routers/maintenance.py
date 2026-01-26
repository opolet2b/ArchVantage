from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.routers.auth import get_current_active_user
from app.models.user import User
from app.services.maintenance_service import maintenance_service
from pydantic import BaseModel
from typing import List, Dict, Any

router = APIRouter()

class CleanupRequest(BaseModel):
    files: List[str] = []
    embeddings: List[str] = []

@router.get("/scan")
def scan_orphans(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Scan for orphaned files and embeddings."""
    # Check for Admin role
    user_role_names = [r.name for r in current_user.roles]
    if "Admin" not in user_role_names and "admin" not in user_role_names:
        raise HTTPException(status_code=403, detail="Not authorized")
        
    return maintenance_service.scan_orphans(db)

@router.post("/cleanup")
def cleanup_orphans(
    request: CleanupRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Delete selected orphaned items."""
    return maintenance_service.delete_orphans(db, request.model_dump())
