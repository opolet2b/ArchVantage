from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel
from app.schemas.canvas_schemas import CanvasResponse

class AnalysisSpaceCreate(BaseModel):
    """Request to create a new analysis space."""
    name: str = "My Analysis Space"
    description: Optional[str] = None

class AnalysisSpaceUpdate(BaseModel):
    """Request to update an analysis space."""
    name: Optional[str] = None
    description: Optional[str] = None

class AnalysisSpaceResponse(BaseModel):
    """Analysis Space response model."""
    id: str
    owner_id: int
    name: str
    description: Optional[str]
    created_at: datetime
    updated_at: Optional[datetime]
    
    # List of canvases in this space
    canvases: List[CanvasResponse] = []

    class Config:
        from_attributes = True
