from typing import List, Optional
from fastapi import APIRouter, Depends, Query
from app.services.debug_service import debug_service, LogEntry
from app.routers.auth import get_current_active_user
from app.models.user import User

router = APIRouter()

@router.get("/debug/logs", response_model=List[LogEntry])
def get_debug_logs(
    limit: int = Query(100, ge=1, le=1000),
    module: Optional[str] = None,
    level: Optional[str] = None,
    current_user: User = Depends(get_current_active_user)
):
    """
    Retrieve debug logs.
    """
    # Assuming any authenticated user can view logs for now, or restrict to Admin?
    # User requested specific debugging capabilities. Let's allow authenticated users.
    return debug_service.get_logs(limit=limit, module=module, level=level)

@router.post("/debug/clear")
def clear_debug_logs(
    current_user: User = Depends(get_current_active_user)
):
    """
    Clear all debug logs.
    """
    debug_service.clear()
    return {"message": "Logs cleared"}
