
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import List, Optional

from app.core.database import get_db
from app.routers.auth import get_current_active_user
from app.models.user import User
from app.services.layout_service import layout_service

router = APIRouter()

class ArrangeRequest(BaseModel):
    canvas_id: str
    thing_ids: Optional[List[str]] = None
    # We could add more options like 'iterations' or 'force_strength' later

@router.post("/layout/arrange")
def arrange_layout(
    request: ArrangeRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Intelligently arrange things on the canvas.
    If thing_ids is provided, only those things are arranged.
    Otherwise, arranging logic depends on service (currently all things).
    """
    try:
        layout_service.arrange_things(
            db=db,
            canvas_id=request.canvas_id,
            thing_ids=request.thing_ids
        )
        return {"status": "success"}
    except Exception as e:
        print(f"[LayoutRouter] Error arranging layout: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=500,
            detail=f"Failed to arrange layout: {str(e)}"
        )
