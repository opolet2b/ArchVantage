"""
Scenario Schemas

Pydantic schemas for the Scenarios feature.

PEP 8 Compliant
"""
from datetime import datetime
from typing import Optional, Dict, Any, List
from pydantic import BaseModel, Field

# =============================================================================
# Scenario Schemas
# =============================================================================

class ScenarioBase(BaseModel):
    """Base schema for scenario data."""
    name: str
    description: Optional[str] = None
    icon: Optional[str] = None
    theme_color: Optional[str] = "#3b82f6"
    is_default: bool = False
    is_system: bool = False
    configuration: Dict[str, Any] = Field(default_factory=dict)

class ScenarioCreate(ScenarioBase):
    """Request to create a new scenario."""
    pass

class ScenarioUpdate(BaseModel):
    """Request to update a scenario."""
    name: Optional[str] = None
    description: Optional[str] = None
    icon: Optional[str] = None
    theme_color: Optional[str] = None
    is_default: Optional[bool] = None
    configuration: Optional[Dict[str, Any]] = None

class ScenarioResponse(ScenarioBase):
    """Response model for a scenario."""
    id: str
    created_by_id: Optional[int] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True

# =============================================================================
# Instantiation Schemas
# =============================================================================

class InstantiateScenarioRequest(BaseModel):
    """Request to create a new canvas from a scenario."""
    scenario_id: str
    canvas_name: Optional[str] = None
    description: Optional[str] = None

class ApplyScenarioRequest(BaseModel):
    """Request to apply a scenario to an existing canvas."""
    scenario_id: str
