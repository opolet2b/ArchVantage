"""
Scenario Routers

API endpoints for managing and using scenarios.

PEP 8 Compliant
"""
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.routers.auth import get_current_user, PermissionChecker
from app.models.user import User
from app.models.scenario_models import Scenario
from app.models.canvas_models import Canvas, Domain, ThingType, CanvasThing
from app.schemas.scenario_schemas import (
    ScenarioCreate, ScenarioUpdate, ScenarioResponse, 
    InstantiateScenarioRequest, ApplyScenarioRequest
)
from app.schemas.canvas_schemas import CanvasResponse
from app.services.debug_service import debug_service

router = APIRouter(prefix="/scenarios", tags=["scenarios"])

# =============================================================================
# CRUD Operations
# =============================================================================

@router.get("/", response_model=List[ScenarioResponse])
@router.get("", response_model=List[ScenarioResponse], include_in_schema=False)
def list_scenarios(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker("scenario:read"))
):
    """List all available scenarios."""
    scenarios = db.query(Scenario).offset(skip).limit(limit).all()
    return scenarios

@router.post("/", response_model=ScenarioResponse)
@router.post("", response_model=ScenarioResponse, include_in_schema=False)
def create_scenario(
    scenario: ScenarioCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker("scenario:write"))
):
    """Create a new scenario definition."""
    # Ensure users can't create system scenarios via API
    scenario_data = scenario.dict()
    scenario_data['is_system'] = False 
    
    # If this is set to default, unset others
    if scenario.is_default:
        db.query(Scenario).filter(Scenario.is_default == True).update({"is_default": False})

    db_scenario = Scenario(
        name=scenario.name,
        description=scenario.description,
        icon=scenario.icon,
        theme_color=scenario.theme_color,
        configuration=scenario.configuration,
        is_default=scenario.is_default,
        is_system=False,
        created_by_id=current_user.id
    )
    db.add(db_scenario)
    db.commit()
    db.refresh(db_scenario)
    debug_service.log("INFO", "Scenario", "CRUD", f"Created scenario: {db_scenario.name} ({db_scenario.id})")
    return db_scenario

@router.get("/{scenario_id}", response_model=ScenarioResponse)
def get_scenario(
    scenario_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker("scenario:read"))
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
    current_user: User = Depends(PermissionChecker("scenario:write"))
):
    """Update a scenario."""
    scenario = db.query(Scenario).filter(Scenario.id == scenario_id).first()
    if not scenario:
        raise HTTPException(status_code=404, detail="Scenario not found")
    
    # Protect System Scenarios
    if scenario.is_system:
        # Allow setting default, but nothing else if it is system
        # Actually, user provided requirement: "Vanilla Scenario ... cannot be modified"
        # But setting it as default might be allowed?
        # Let's say we allow ONLY 'is_default' update for system scenarios?
        # For now, strict: If system, NO editing of content. 
        # But we MUST allow 'is_default' toggle.
        
        allowed_keys = {'is_default'}
        update_keys = updates.dict(exclude_unset=True).keys()
        if any(k for k in update_keys if k not in allowed_keys):
             raise HTTPException(status_code=403, detail="System scenarios cannot be modified")

    update_data = updates.dict(exclude_unset=True)
    
    # Handle Default Switch
    if update_data.get("is_default") is True:
        db.query(Scenario).filter(Scenario.is_default == True).update({"is_default": False})
    
    for key, value in update_data.items():
        setattr(scenario, key, value)
    
    db.commit()
    db.refresh(scenario)
    return scenario

@router.delete("/{scenario_id}")
def delete_scenario(
    scenario_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker("scenario:write"))
):
    """Delete a scenario."""
    scenario = db.query(Scenario).filter(Scenario.id == scenario_id).first()
    if not scenario:
        raise HTTPException(status_code=404, detail="Scenario not found")
    
    if scenario.is_system:
        raise HTTPException(status_code=403, detail="System scenarios cannot be deleted")
    
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
    current_user: User = Depends(PermissionChecker("scenario:write"))
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
            "ui_overrides": config.get("ui_overrides", {}),
            "domain_definitions": config.get("domain_definitions", []),
            "domain_groups": config.get("domain_groups", []),
            "thing_metadata_schema": config.get("thing_metadata_schema", [])
        }
    )
    db.add(new_canvas)
    db.flush() # Get ID
    
    # 2. Instantiate Default Domains from Scenario Definitions
    domain_definitions = config.get("domain_definitions", [])
    print(f"[Scenario] Instantiating scenario {scenario.name} with {len(domain_definitions)} definitions")
    
    # Track index for staggering
    created_count = 0
    for definition in domain_definitions:
        # Check if we should create this domain by default
        # Use truthy check for safety
        is_default = definition.get("create_by_default") or str(definition.get("create_by_default")).lower() == 'true'
        print(f"  - Definition: {definition.get('name')} (ID: {definition.get('id')}), create_by_default: {is_default}")
        
        if is_default:
            def_id = definition.get("id")
            if not def_id:
                print("    ! Skipping: No ID found in definition")
                continue

            v_config = definition.get("visual_config") or {}
            
            # Use grid calculation to avoid stacking nodes on top of each other
            GRID_COLUMNS = 3
            X_START = 100
            Y_START = 100
            X_OFFSET = 900 # Width 800 + 100 gap
            Y_OFFSET = 1100 # Height 1000 + 100 gap
            
            col = created_count % GRID_COLUMNS
            row = created_count // GRID_COLUMNS
            
            pos_x = X_START + col * X_OFFSET
            pos_y = Y_START + row * Y_OFFSET
            
            print(f"    + Creating domain at ({pos_x}, {pos_y}) with {len(definition.get('drop_zones', []))} drop zones")
            
            new_domain = Domain(
                canvas_id=new_canvas.id,
                name=definition.get("name") or definition.get("label") or f"Domain {created_count + 1}",
                type=def_id,
                position_x=pos_x,
                position_y=pos_y,
                width=v_config.get("width", 800),
                height=v_config.get("height", 1000),
                color=v_config.get("color") or scenario.theme_color or "#3b82f6",
                visual_config=v_config,
                metadata_schema=definition.get("metadata_schema") or [],
                drop_zones=definition.get("drop_zones") or []
            )
            db.add(new_domain)
            created_count += 1
    
    # Legacy ghost nodes removed as per user preference for "no garbage"
        
    db.commit()
    db.refresh(new_canvas)
    debug_service.log("INFO", "Scenario", "Instantiation", f"Instantiated scenario {scenario.name} into canvas {new_canvas.id}")
    return new_canvas


@router.post("/apply-to-canvas/{canvas_id}", response_model=CanvasResponse)
def apply_to_canvas(
    canvas_id: str,
    request: ApplyScenarioRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker("scenario:write"))
):
    """
    Apply a scenario to an existing canvas.
    Updates overrides and provisions default domains.
    """
    scenario = db.query(Scenario).filter(Scenario.id == request.scenario_id).first()
    if not scenario:
        raise HTTPException(status_code=404, detail="Scenario not found")

    canvas = db.query(Canvas).filter(Canvas.id == canvas_id).first()
    if not canvas:
        raise HTTPException(status_code=404, detail="Canvas not found")

    config = scenario.configuration

    # Update Canvas Config
    # We use dict() to ensure SQLAlchemy detects the change (mutation tracking)
    new_config = dict(canvas.owner_config or {})
    new_config.update({
        "scenario_id": scenario.id,
        "theme_color": scenario.theme_color,
        "automations": config.get("automations", []),
        "ui_overrides": config.get("ui_overrides", {}),
        "domain_definitions": config.get("domain_definitions", []),
        "domain_groups": config.get("domain_groups", []),
        "thing_metadata_schema": config.get("thing_metadata_schema", [])
    })
    canvas.owner_config = new_config
    db.add(canvas)

    # Provision Default Domains
    # We look for definitions marked with 'create_by_default'
    domain_definitions = config.get("domain_definitions", [])
    print(f"[Scenario] Applying scenario {scenario.name} to canvas {canvas_id}. Found {len(domain_definitions)} definitions.")
    
    # Current existing domain types on this canvas to avoid exact duplicates
    existing_types = {d.type for d in db.query(Domain).filter(Domain.canvas_id == canvas_id).all()}
    print(f"  - Existing domain types on canvas: {existing_types}")
    
    # Track index for staggering
    created_count = 0
    for definition in domain_definitions:
        # Check if we should create this domain by default
        # Use truthy check for flexibility
        is_default = definition.get("create_by_default") or str(definition.get("create_by_default")).lower() == 'true'
        print(f"  - Definition: {definition.get('name')} (ID: {definition.get('id')}), create_by_default: {is_default}")

        if is_default:
            # Only create if no domain of this type exists
            def_id = definition.get("id")
            if not def_id:
                print("    ! Skipping: No ID found in definition")
                continue

            if def_id not in existing_types:
                # Safely get visual config
                v_config = definition.get("visual_config") or {}
                
                # Use grid calculation to avoid stacking nodes
                GRID_COLUMNS = 3
                X_START = 100
                Y_START = 100
                X_OFFSET = 900 # Width 800 + 100 gap
                Y_OFFSET = 1100 # Height 1000 + 100 gap
                
                col = created_count % GRID_COLUMNS
                row = created_count // GRID_COLUMNS
                
                pos_x = X_START + col * X_OFFSET
                pos_y = Y_START + row * Y_OFFSET
                
                print(f"    + Creating domain at ({pos_x}, {pos_y}) with {len(definition.get('drop_zones', []))} drop zones")
 
                new_domain = Domain(
                    canvas_id=canvas.id,
                    name=definition.get("name") or definition.get("label") or f"Domain {created_count + 1}",
                    type=def_id,
                    position_x=pos_x,
                    position_y=pos_y,
                    width=v_config.get("width", 800),
                    height=v_config.get("height", 1000),
                    color=v_config.get("color") or scenario.theme_color or "#3b82f6",
                    visual_config=v_config,
                    metadata_schema=definition.get("metadata_schema") or [],
                    drop_zones=definition.get("drop_zones") or []
                )
                db.add(new_domain)
                created_count += 1
            else:
                print(f"    - Type {def_id} already exists, skipping provisioning.")

    db.commit()
    db.refresh(canvas)
    return canvas
