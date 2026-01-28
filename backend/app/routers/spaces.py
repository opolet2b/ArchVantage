from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.core.database import get_db
from app.routers.auth import get_current_user
from app.models.user import User
from app.models.canvas_models import AnalysisSpace, Canvas
from app.schemas.space_schemas import (
    AnalysisSpaceCreate,
    AnalysisSpaceResponse,
    AnalysisSpaceUpdate,
)

router = APIRouter(
    prefix="/spaces",
    tags=["spaces"],
    responses={404: {"description": "Not found"}},
)

@router.post("", response_model=AnalysisSpaceResponse)
def create_space(
    space: AnalysisSpaceCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a new analysis space."""
    db_space = AnalysisSpace(
        owner_id=current_user.id,
        name=space.name,
        description=space.description
    )
    db.add(db_space)
    db.commit()
    db.refresh(db_space)
    return db_space

@router.get("", response_model=List[AnalysisSpaceResponse])
def read_spaces(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all analysis spaces for the current user."""
    spaces = db.query(AnalysisSpace).filter(AnalysisSpace.owner_id == current_user.id).offset(skip).limit(limit).all()
    return spaces

@router.get("/{space_id}", response_model=AnalysisSpaceResponse)
def read_space(
    space_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get a specific analysis space by ID."""
    space = db.query(AnalysisSpace).filter(AnalysisSpace.id == space_id).first()
    if space is None:
        raise HTTPException(status_code=404, detail="Analysis Space not found")
    if space.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to access this space")
    return space

@router.put("/{space_id}", response_model=AnalysisSpaceResponse)
def update_space(
    space_id: str,
    space_update: AnalysisSpaceUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update an analysis space."""
    db_space = db.query(AnalysisSpace).filter(AnalysisSpace.id == space_id).first()
    if db_space is None:
        raise HTTPException(status_code=404, detail="Analysis Space not found")
    if db_space.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to update this space")

    if space_update.name is not None:
        db_space.name = space_update.name
    if space_update.description is not None:
        db_space.description = space_update.description

    db.commit()
    db.refresh(db_space)
    return db_space

@router.delete("/{space_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_space(
    space_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete an analysis space."""
    db_space = db.query(AnalysisSpace).filter(AnalysisSpace.id == space_id).first()
    if db_space is None:
        raise HTTPException(status_code=404, detail="Analysis Space not found")
    if db_space.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to delete this space")

    db.delete(db_space)
    db.commit()
    return None

@router.post("/{space_id}/canvases/{canvas_id}", response_model=AnalysisSpaceResponse)
def add_canvas_to_space(
    space_id: str,
    canvas_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Add a canvas to an analysis space."""
    space = db.query(AnalysisSpace).filter(AnalysisSpace.id == space_id).first()
    if space is None:
        raise HTTPException(status_code=404, detail="Analysis Space not found")
    if space.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to modify this space")

    canvas = db.query(Canvas).filter(Canvas.id == canvas_id).first()
    if canvas is None:
        raise HTTPException(status_code=404, detail="Canvas not found")
    # Verify canvas ownership/access
    if canvas.owner_id != current_user.id and current_user.id not in canvas.allowed_user_ids:
         raise HTTPException(status_code=403, detail="Not authorized to access this canvas")

    canvas.analysis_space_id = space_id
    db.commit()
    db.refresh(space)
    return space

@router.delete("/{space_id}/canvases/{canvas_id}", response_model=AnalysisSpaceResponse)
def remove_canvas_from_space(
    space_id: str,
    canvas_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Remove a canvas from an analysis space."""
    space = db.query(AnalysisSpace).filter(AnalysisSpace.id == space_id).first()
    if space is None:
        raise HTTPException(status_code=404, detail="Analysis Space not found")
    if space.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to modify this space")

    canvas = db.query(Canvas).filter(Canvas.id == canvas_id).first()
    if canvas is None:
        raise HTTPException(status_code=404, detail="Canvas not found")
    
    if canvas.analysis_space_id != space_id:
        raise HTTPException(status_code=400, detail="Canvas is not in this space")
        
    canvas.analysis_space_id = None
    db.commit()
    db.refresh(space)
    return space

@router.put("/{space_id}/reorder", response_model=AnalysisSpaceResponse)
def reorder_canvases(
    space_id: str,
    canvas_ids: List[str],
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Reorder canvases within an analysis space."""
    space = db.query(AnalysisSpace).filter(AnalysisSpace.id == space_id).first()
    if space is None:
        raise HTTPException(status_code=404, detail="Analysis Space not found")
    if space.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to modify this space")
    
    # Verify all canvases belong to the space
    canvases = db.query(Canvas).filter(
        Canvas.analysis_space_id == space_id,
        Canvas.id.in_(canvas_ids)
    ).all()
    
    if len(canvases) != len(canvas_ids):
        # Could be mismatch or some IDs invalid, but let's just update what we found
        pass

    # Create a map for quick lookup
    canvas_map = {c.id: c for c in canvases}
    
    # Update positions
    for index, cid in enumerate(canvas_ids):
        if cid in canvas_map:
            canvas_map[cid].position = index
            
    db.commit()
    db.refresh(space)
    return space
