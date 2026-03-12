from typing import List, Optional
from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response
from app.services.debug_service import debug_service, LogEntry
from app.routers.auth import get_current_active_user
from app.models.user import User

router = APIRouter()

@router.get("/debug/features", response_model=List[str])
def get_debug_features(
    current_user: User = Depends(get_current_active_user)
):
    """
    List all features that have registered logs.
    """
    return debug_service.get_features()

@router.get("/debug/logs", response_model=List[LogEntry])
def get_debug_logs(
    limit: int = Query(100, ge=1, le=1000),
    feature: Optional[str] = None,
    level: Optional[str] = None,
    keyword: Optional[str] = None,
    current_user: User = Depends(get_current_active_user)
):
    """
    Retrieve debug logs with filtering.
    """
    return debug_service.get_logs(limit=limit, feature=feature, level=level, keyword=keyword)

@router.get("/debug/logs/download")
def download_debug_logs(
    feature: str,
    current_user: User = Depends(get_current_active_user)
):
    """
    Download logs for a specific feature as a text file.
    """
    content = debug_service.download_logs(feature)
    return Response(
        content=content,
        media_type="text/plain",
        headers={"Content-Disposition": f"attachment; filename=debug_{feature}.log"}
    )

@router.post("/debug/clear")
def clear_debug_logs(
    feature: Optional[str] = None,
    current_user: User = Depends(get_current_active_user)
):
    """
    Clear logs for a specific feature or all logs.
    """
    debug_service.clear(feature=feature)
    return {"message": f"Logs cleared for {feature or 'all features'}"}
