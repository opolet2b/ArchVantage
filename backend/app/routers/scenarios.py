"""
Scenario Routers

API endpoints for managing and using scenarios.

PEP 8 Compliant
"""
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.models.scenario_models import Scenario
from app.models.canvas_models import Canvas, Domain, ThingType, CanvasThing
from app.schemas.scenario_schemas import (
    ScenarioCreate, ScenarioUpdate, ScenarioResponse, InstantiateScenarioRequest
)
from app.schemas.canvas_schemas import CanvasResponse

router = APIRouter(prefix="/scenarios", tags=["scenarios"])

# =============================================================================
# CRUD Operations
# =============================================================================

@router.get("/", response_model=List[ScenarioResponse])
def list_scenarios(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """List all available scenarios."""
    scenarios = db.query(Scenario).offset(skip).limit(limit).all()
    return scenarios

@router.post("/", response_model=ScenarioResponse)
def create_scenario(
    scenario: ScenarioCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Create a new scenario definition."""
    db_scenario = Scenario(
        name=scenario.name,
        description=scenario.description,
        icon=scenario.icon,
        theme_color=scenario.theme_color,
        configuration=scenario.configuration,
        created_by_id=current_user.id
    )
    db.add(db_scenario)
    db.commit()
    db.refresh(db_scenario)
    return db_scenario

@router.get("/{scenario_id}", response_model=ScenarioResponse)
def get_scenario(
    scenario_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get a specific scenario by ID."""
    scenario = db.query(Scenario).filter(Scenario.id == scenario_id).first()
    if not scenario:
        raise HTTPException(status_code=404, detail="Scenario not found")
    return scenario

@router.patch("/{scenario_id}", response_model=ScenarioResponse)
def update_scenario(
    scenario_id: str,
    updates: ScenarioUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Update a scenario."""
    scenario = db.query(Scenario).filter(Scenario.id == scenario_id).first()
    if not scenario:
        raise HTTPException(status_code=404, detail="Scenario not found")
    
    update_data = updates.dict(exclude_unset=True)
    for key, value in update_data.items():
        setattr(scenario, key, value)
    
    db.commit()
    db.refresh(scenario)
    return scenario

@router.delete("/{scenario_id}")
def delete_scenario(
    scenario_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Delete a scenario."""
    scenario = db.query(Scenario).filter(Scenario.id == scenario_id).first()
    if not scenario:
        raise HTTPException(status_code=404, detail="Scenario not found")
    
    db.delete(scenario)
    db.commit()
    return {"message": "Scenario deleted"}

# =============================================================================
# Instantiation
# =============================================================================

@router.post("/{scenario_id}/instantiate", response_model=CanvasResponse)
def instantiate_scenario(
    request: InstantiateScenarioRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Create a new 'Master Canvas' based on a scenario.
    This copies the default domains, ghost nodes, and settings.
    """
    scenario = db.query(Scenario).filter(Scenario.id == request.scenario_id).first()
    if not scenario:
        raise HTTPException(status_code=404, detail="Scenario not found")
    
    config = scenario.configuration
    
    # 1. Create Canvas with Scenario Config
    new_canvas = Canvas(
        name=request.canvas_name or f"{scenario.name} Board",
        description=request.description or scenario.description,
        owner_id=current_user.id,
        owner_config={
            "scenario_id": scenario.id,
            "theme_color": scenario.theme_color,
            "automations": config.get("automations", []),
            "ui_overrides": config.get("ui_overrides", {})
        }
    )
    db.add(new_canvas)
    db.flush() # Get ID
    
    # 2. Instantiate Objects from Scenario Initialization Config
    init_config = config.get("initialization", {}).get("master_canvas", {})
    
    # Domains
    domains_config = init_config.get("domains", [])
    domain_map = {} # Maps scenario domain type to DB ID if needed? Or just use type.
    
    for d_conf in domains_config:
        # Find definition in domain_definitions list if needed, or use inline
        # Usually config has "type" which refers to a definition in 'domain_definitions'
        domain_type = d_conf.get("type")
        
        # Look up visual config from scenario definitions
        definition = next((d for d in config.get("domain_definitions", []) if d["id"] == domain_type), {})
        
        new_domain = Domain(
            canvas_id=new_canvas.id,
            name=d_conf.get("label") or definition.get("label", "New Domain"),
            type=domain_type,
            position_x=d_conf.get("x", 0),
            position_y=d_conf.get("y", 0),
            width=d_conf.get("w", 300),
            height=d_conf.get("h", 400),
            color=definition.get("visual_config", {}).get("primary_color", scenario.theme_color),
            visual_config=definition.get("visual_config", {}),
            metadata_schema=definition.get("metadata_schema", {})
        )
        db.add(new_domain)
    
    # Ghost Nodes (Modeled as specific ThingType or just placeholder things)
    # For now, let's assume we create them as TEXT things with a special "ghost" property in content
    ghost_nodes = init_config.get("ghost_nodes", [])
    
    for g_conf in ghost_nodes:
        ghost_thing = CanvasThing(
            canvas_id=new_canvas.id,
            type=ThingType.TEXT, # Use text as base
            title=g_conf.get("label", "Placeholder"),
            position_x=g_conf.get("x", 0),
            position_y=g_conf.get("y", 0),
            width=200,
            height=100,
            content={
                "text": g_conf.get("label"), 
                "is_ghost": True,
                "on_drop": g_conf.get("on_drop")
            },
            iconified=False
        )
        db.add(ghost_thing)
        
    db.commit()
    db.refresh(new_canvas)
    return new_canvas
