"""
Agent Blueprints Router

API endpoints for managing Agent Blueprints.
Handles CRUD operations and blueprint generation from natural language.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
import uuid

from app.core.database import get_db
from app.schemas.agent_schemas import (
    BlueprintCreate, BlueprintUpdate, BlueprintResponse, BlueprintListItem,
    BlueprintGenerateRequest, BlueprintGenerateResponse, SecretCreate, SecretResponse,
    PromptOptimizeRequest, PromptOptimizeResponse
)
from app.models.agent_blueprint import AgentBlueprint, AgentNode, AgentEdge
from app.routers.auth import get_current_active_user, get_current_admin_user
from app.models.user import User
from app.services.agent_architect import agent_architect
from app.services.agent_secret_manager import secret_manager


router = APIRouter()


# -----------------------------------------------------------------------------
# Helper Functions
# -----------------------------------------------------------------------------

def infer_inputs_schema_from_graph(graph: dict) -> dict:
    """
    Infer inputs_schema from a blueprint's graph by scanning params for variable references.
    
    Scans all node parameters for {{inputs.xxx}} or {{variables.xxx}} patterns
    and builds an inputs_schema from them.
    
    Args:
        graph: The blueprint's graph dict with nodes and edges
        
    Returns:
        Inferred inputs_schema dict or empty dict if none found
    """
    import re
    
    discovered_inputs = set()
    pattern = re.compile(r'\{\{(?:inputs|variables)\.(\w+)\}\}')
    
    nodes = graph.get("nodes", [])
    
    for node in nodes:
        params = node.get("params", {})
        
        # Recursively find all string values in params
        def scan_value(value):
            if isinstance(value, str):
                matches = pattern.findall(value)
                discovered_inputs.update(matches)
            elif isinstance(value, dict):
                for v in value.values():
                    scan_value(v)
            elif isinstance(value, list):
                for item in value:
                    scan_value(item)
        
        scan_value(params)
    
    # Build inputs_schema from discovered inputs
    if discovered_inputs:
        inferred_schema = {
            "type": "object",
            "properties": {},
            "required": []
        }
        
        for input_name in sorted(discovered_inputs):
            # Skip internal variables (start with _)
            if input_name.startswith("_"):
                continue
                
            inferred_schema["properties"][input_name] = {
                "type": "string",
                "description": f"Input value for {input_name}"
            }
            inferred_schema["required"].append(input_name)
        
        if inferred_schema["properties"]:
            return inferred_schema
    
    return {}


# -----------------------------------------------------------------------------
# Blueprint CRUD
# -----------------------------------------------------------------------------

@router.get("/agent-blueprints", response_model=List[BlueprintListItem])
async def list_blueprints(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """List all blueprints accessible to the current user."""
    # Get user's own blueprints and published blueprints
    blueprints = db.query(AgentBlueprint).filter(
        (AgentBlueprint.owner_id == current_user.id) | 
        (AgentBlueprint.is_published == True)
    ).offset(skip).limit(limit).all()
    
    # Apply runtime inference for blueprints with empty inputs_schema
    result = []
    for bp in blueprints:
        inputs_schema = bp.inputs_schema or {}
        
        # If inputs_schema is empty or has no properties, try to infer from graph
        if not inputs_schema.get("properties"):
            graph = bp.graph or {}
            inferred = infer_inputs_schema_from_graph(graph)
            if inferred:
                inputs_schema = inferred
        
        # Create a dict with the inferred schema
        result.append({
            "id": bp.id,
            "name": bp.name,
            "description": bp.description,
            "version": bp.version,
            "is_published": bp.is_published,
            "inputs_schema": inputs_schema,
            "created_at": bp.created_at
        })
    
    return result


@router.post("/agent-blueprints", response_model=BlueprintResponse)
async def create_blueprint(
    blueprint: BlueprintCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Create a new blueprint."""
    # Generate UUID for the blueprint
    blueprint_id = str(uuid.uuid4())
    
    # Create blueprint model
    db_blueprint = AgentBlueprint(
        id=blueprint_id,
        name=blueprint.name,
        description=blueprint.description,
        graph=blueprint.graph.model_dump(),
        inputs_schema=blueprint.inputs_schema,
        secrets_requirements=blueprint.secrets_requirements,
        test_config=blueprint.test_config,
        owner_id=current_user.id
    )
    
    db.add(db_blueprint)
    db.commit()
    db.refresh(db_blueprint)
    
    return db_blueprint


@router.get("/agent-blueprints/{blueprint_id}", response_model=BlueprintResponse)
async def get_blueprint(
    blueprint_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Get a blueprint by ID."""
    blueprint = db.query(AgentBlueprint).filter(
        AgentBlueprint.id == blueprint_id
    ).first()
    
    if not blueprint:
        raise HTTPException(status_code=404, detail="Blueprint not found")
    
    # Check access
    if blueprint.owner_id != current_user.id and not blueprint.is_published:
        raise HTTPException(status_code=403, detail="Access denied")
    
    return blueprint


@router.put("/agent-blueprints/{blueprint_id}", response_model=BlueprintResponse)
async def update_blueprint(
    blueprint_id: str,
    update: BlueprintUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Update a blueprint."""
    blueprint = db.query(AgentBlueprint).filter(
        AgentBlueprint.id == blueprint_id
    ).first()
    
    if not blueprint:
        raise HTTPException(status_code=404, detail="Blueprint not found")
    
    # Check ownership
    if blueprint.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only owner can update")
    
    # Update fields
    if update.name is not None:
        blueprint.name = update.name
    if update.description is not None:
        blueprint.description = update.description
    if update.graph is not None:
        blueprint.graph = update.graph.model_dump()
    if update.inputs_schema is not None:
        blueprint.inputs_schema = update.inputs_schema
    if update.secrets_requirements is not None:
        blueprint.secrets_requirements = update.secrets_requirements
    if update.is_published is not None:
        blueprint.is_published = update.is_published
    if update.test_config is not None:
        blueprint.test_config = update.test_config
    
    db.commit()
    db.refresh(blueprint)
    
    return blueprint


@router.delete("/agent-blueprints/{blueprint_id}")
async def delete_blueprint(
    blueprint_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Delete a blueprint."""
    blueprint = db.query(AgentBlueprint).filter(
        AgentBlueprint.id == blueprint_id
    ).first()
    
    if not blueprint:
        raise HTTPException(status_code=404, detail="Blueprint not found")
    
    # Check ownership (admins can delete any)
    is_admin = current_user.is_superuser if hasattr(current_user, 'is_superuser') else False
    if blueprint.owner_id != current_user.id and not is_admin:
        raise HTTPException(status_code=403, detail="Only owner can delete")
    
    db.delete(blueprint)
    db.commit()
    
    return {"status": "success", "id": blueprint_id}


# -----------------------------------------------------------------------------
# Blueprint Generation
# -----------------------------------------------------------------------------

@router.post("/agent-blueprints/generate", response_model=BlueprintGenerateResponse)
async def generate_blueprint(
    request: BlueprintGenerateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Generate a blueprint from natural language description."""
    try:
        blueprint_dict = await agent_architect.generate_blueprint(
            prompt=request.prompt,
            model=request.model,
            selected_tool_ids=request.selected_tool_ids,
            selected_apis=request.selected_apis,
            canvas_context=request.canvas_context.model_dump() if request.canvas_context else None,
            db=db
        )
        
        # Validate the generated blueprint
        validation = agent_architect.validate_blueprint(blueprint_dict)
        
        if not validation["is_valid"]:
            raise HTTPException(
                status_code=422,
                detail=f"Generated blueprint is invalid: {validation['errors']}"
            )
        
        # Convert to response model
        from app.schemas.agent_schemas import AgentGraph
        from datetime import datetime
        
        blueprint_response = BlueprintResponse(
            id=blueprint_dict.get("id", str(uuid.uuid4())),
            name=blueprint_dict.get("name", "Generated Agent"),
            description=blueprint_dict.get("description"),
            version="1.0",
            graph=AgentGraph(**blueprint_dict.get("graph", {"nodes": [], "edges": []})),
            inputs_schema=blueprint_dict.get("inputs_schema", {}),
            secrets_requirements=blueprint_dict.get("secrets_requirements", []),
            owner_id=current_user.id,
            is_published=False,
            created_at=datetime.now()
        )
        
        return BlueprintGenerateResponse(
            blueprint=blueprint_response,
            discovered_tools=[]
        )
        
    except Exception as e:
        import traceback
        print(f"Blueprint generation error: {e}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/agent-blueprints/optimize-prompt", response_model=PromptOptimizeResponse)
async def optimize_prompt(
    request: PromptOptimizeRequest,
    current_user: User = Depends(get_current_active_user)
):
    """
    Optimize a user's prompt using the selected LLM.
    """
    try:
        optimized = await agent_architect.optimize_prompt(
            prompt=request.prompt,
            model=request.model
        )
        return PromptOptimizeResponse(optimized_prompt=optimized)
    except Exception as e:
        print(f"Prompt optimization error: {e}")
        raise HTTPException(status_code=500, detail=str(e))



@router.post("/agent-blueprints/{blueprint_id}/validate")
async def validate_blueprint(
    blueprint_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Validate a blueprint structure."""
    blueprint = db.query(AgentBlueprint).filter(
        AgentBlueprint.id == blueprint_id
    ).first()
    
    if not blueprint:
        raise HTTPException(status_code=404, detail="Blueprint not found")
    
    blueprint_dict = {
        "graph": blueprint.graph,
        "inputs_schema": blueprint.inputs_schema
    }
    
    validation = agent_architect.validate_blueprint(blueprint_dict)
    
    return validation


# -----------------------------------------------------------------------------
# Secret Management
# -----------------------------------------------------------------------------

@router.get("/agent-blueprints/{blueprint_id}/secrets", response_model=List[SecretResponse])
async def list_secrets(
    blueprint_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """List secrets for a blueprint (values are never returned)."""
    from app.models.agent_blueprint import AgentSecret
    
    blueprint = db.query(AgentBlueprint).filter(
        AgentBlueprint.id == blueprint_id
    ).first()
    
    if not blueprint:
        raise HTTPException(status_code=404, detail="Blueprint not found")
    
    if blueprint.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")
    
    secrets = db.query(AgentSecret).filter(
        AgentSecret.blueprint_id == blueprint_id
    ).all()
    
    return secrets


@router.post("/agent-blueprints/{blueprint_id}/secrets", response_model=SecretResponse)
async def create_secret(
    blueprint_id: str,
    secret: SecretCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Create or update a secret for a blueprint."""
    blueprint = db.query(AgentBlueprint).filter(
        AgentBlueprint.id == blueprint_id
    ).first()
    
    if not blueprint:
        raise HTTPException(status_code=404, detail="Blueprint not found")
    
    if blueprint.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only owner can manage secrets")
    
    secret_manager.save_secret(db, blueprint_id, secret.key_name, secret.value)
    
    from app.models.agent_blueprint import AgentSecret
    saved = db.query(AgentSecret).filter(
        AgentSecret.blueprint_id == blueprint_id,
        AgentSecret.key_name == secret.key_name
    ).first()
    
    return saved


@router.delete("/agent-blueprints/{blueprint_id}/secrets/{key_name}")
async def delete_secret(
    blueprint_id: str,
    key_name: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Delete a secret from a blueprint."""
    blueprint = db.query(AgentBlueprint).filter(
        AgentBlueprint.id == blueprint_id
    ).first()
    
    if not blueprint:
        raise HTTPException(status_code=404, detail="Blueprint not found")
    
    if blueprint.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only owner can manage secrets")
    
    secret_manager.delete_secret(db, blueprint_id, key_name)
    
    return {"status": "success"}


# -----------------------------------------------------------------------------
# Schema Discovery Endpoints
# -----------------------------------------------------------------------------

@router.get("/agent-blueprints/{blueprint_id}/nodes/{node_id}/schemas")
async def get_node_schemas(
    blueprint_id: str,
    node_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Get input/output schemas for a specific node.
    
    Returns schemas from all incoming nodes (sources) and
    schemas from all outgoing nodes (targets).
    
    Used by the JSON_MAPPING Inspector to show available fields.
    """
    from app.services.schema_discovery import (
        get_incoming_schemas,
        get_outgoing_schemas
    )
    
    blueprint = db.query(AgentBlueprint).filter(
        AgentBlueprint.id == blueprint_id
    ).first()
    
    if not blueprint:
        raise HTTPException(status_code=404, detail="Blueprint not found")
    
    # Get graph from blueprint
    graph = blueprint.graph
    if isinstance(graph, str):
        import json
        graph = json.loads(graph)
    
    # Get incoming schemas (from nodes that connect TO this node)
    incoming = get_incoming_schemas(graph, node_id, db)
    
    # Get outgoing schemas (from nodes this node connects TO)
    outgoing = get_outgoing_schemas(graph, node_id, db)
    
    # Collect any errors for display
    discovery_errors = []
    for schema in incoming:
        if "error" in schema:
            discovery_errors.append(
                f"Incoming {schema.get('node_id', 'unknown')}: {schema['error']}"
            )
    for schema in outgoing:
        if "error" in schema:
            discovery_errors.append(
                f"Outgoing {schema.get('node_id', 'unknown')}: {schema['error']}"
            )
    
    return {
        "node_id": node_id,
        "incoming": incoming,
        "outgoing": outgoing,
        "discovery_errors": discovery_errors
    }

