"""
ArchVantage Router

API endpoints for the ArchVantage feature.
Handles CRUD operations for canvases, things, links, and domains.

PEP 8 Compliant
"""
from typing import List, Dict, Any, Optional
import traceback
import json
import os
import uuid
import datetime
from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks, File, Form, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified

from sqlalchemy import or_
from app.core.database import get_db
from app.routers.auth import get_current_active_user, PermissionChecker
from app.models.user import User, Role
from app.models.canvas_models import (
    Canvas, CanvasThing, CanvasLink, Domain,
    ThingType as ModelThingType, LinkType as ModelLinkType, RAGStatus,
    CanvasUser, CanvasRole
)
from app.schemas.canvas_schemas import (
    CanvasCreate, CanvasUpdate, CanvasResponse, CanvasWithContents,
    ThingCreate, ThingUpdate, ThingResponse,
    LinkCreate, LinkUpdate, LinkResponse,
    DomainCreate, DomainUpdate, DomainResponse,
    SummarizeRequest, SummarizeResponse,
    AnalyzeRequest, AnalyzeResponse, AnalyzeAction, BatchAnalyzeRequest,
    DiscoverLinksRequest, DiscoverLinksResponse, DiscoveredLinkDetail,
    DiscoverLinksRequest, DiscoverLinksResponse, DiscoveredLinkDetail,
    ExecuteTemplateRequest, ExecuteTemplateResponse, BatchDeleteRequest
)
from app.services.rag_service import rag_service
from app.services.smart_template_service import smart_template_service
from app.services.debug_service import debug_service
from app.services.llm_service import llm_service
from app.models.chat import Message
from app.services.config_service import config_service
from app.services.prompt_service import prompt_service
from app.prompts import SUMMARIZE_PROMPT, EXPLAIN_PROMPT
from app.routers.canvas_worker import handle_async_vectorization
from pydantic import BaseModel
from app.services.automation_service import automation_service
import app.plugins


class CanvasEventRequest(BaseModel):
    hook: str
    payload: Dict[str, Any]


router = APIRouter()


def _get_canvas_access_level(canvas: Canvas, user: User) -> str:
    """Calculate effective access level for a user on a canvas."""
    # 1. Owner always has 'write'
    if canvas.owner_id == user.id:
        return "write"
    
    # 2. Admins always have 'write'
    if any(role.name == "Admin" for role in user.roles):
        return "write"
    
    # 3. Check specific user permissions
    # We query the association model directly for clarity
    from sqlalchemy.orm import Session
    db = Session.object_session(canvas)
    
    user_p = db.query(CanvasUser).filter(
        CanvasUser.canvas_id == canvas.id,
        CanvasUser.user_id == user.id
    ).first()
    
    if user_p and user_p.permission_level == "write":
        return "write"
    
    # 4. Check role-based permissions
    user_role_ids = [role.id for role in user.roles]
    role_ps = db.query(CanvasRole).filter(
        CanvasRole.canvas_id == canvas.id,
        CanvasRole.role_id.in_(user_role_ids)
    ).all()
    
    if any(p.permission_level == "write" for p in role_ps):
        return "write"
    
    # 5. Default to 'read' if any record exists, otherwise check if they matched the query
    if user_p or role_ps:
        return "read"
        
    return "read" # Fallback if they passed the initial filter


def _get_canvas_with_access(canvas_id: str, db: Session, user: User, abort_if_not_found: bool = True, require_write: bool = False) -> Optional[Canvas]:
    """
    Helper to find a canvas if the user has permission (owner, allowed user, or role).
    """
    user_role_ids = [role.id for role in user.roles]
    canvas = db.query(Canvas).filter(
        Canvas.id == canvas_id,
        or_(
            Canvas.owner_id == user.id,
            Canvas.allowed_users.any(id=user.id),
            Canvas.allowed_roles.any(Role.id.in_(user_role_ids))
        )
    ).first()

    if not canvas and abort_if_not_found:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Canvas not found or access denied"
        )
    
    if canvas:
        # Inject effective level into the object for the response schema
        canvas.access_level = _get_canvas_access_level(canvas, user)
        
        if require_write and canvas.access_level != "write":
             raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You have read-only access to this canvas"
            )
        
    return canvas


def _resolve_active_model(db: Session, canvas_id: str, requested_model: Optional[str]) -> Optional[str]:
    """
    Resolve requested model name to actual preset name.
    If requested_model is 'default', use the canvas-specific default from settings.
    """
    if requested_model and requested_model != "default":
        return requested_model

    # Fetch canvas to check its local model setting
    canvas = db.query(Canvas).filter(Canvas.id == canvas_id).first()
    if canvas:
        config = canvas.owner_config or {}
        canvas_model = config.get("model")
        if canvas_model:
            print(f"[CanvasRouter] Resolved 'default' model to Canvas setting: {canvas_model}")
            return canvas_model

    # Fallback to system default
    preset = config_service.get_default_llm_preset()
    system_default = preset.get("name") if preset else None
    print(f"[CanvasRouter] Resolved 'default' model to System default: {system_default}")
    return system_default


# =============================================================================
# Canvas CRUD
# =============================================================================

@router.post("/canvases", response_model=CanvasResponse)
def create_canvas(
    request: CanvasCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker("canvas:write"))
):
    """Create a new canvas for the current user."""
    canvas = Canvas(
        owner_id=current_user.id,
        name=request.name,
        description=request.description
    )
    
    # Set permissions
    if request.user_permissions:
        for p in request.user_permissions:
            assoc = CanvasUser(user_id=p.user_id, permission_level=p.level.value)
            canvas.user_permissions.append(assoc)
            
    if request.role_permissions:
        for p in request.role_permissions:
            assoc = CanvasRole(role_id=p.role_id, permission_level=p.level.value)
            canvas.role_permissions.append(assoc)
        
    db.add(canvas)
    db.commit()
    db.refresh(canvas)
    debug_service.log("INFO", "Canvas", "CRUD", f"Created canvas: {canvas.name} ({canvas.id})", {"owner_id": current_user.id})
    return canvas


@router.get("/canvases", response_model=List[CanvasResponse])
def list_canvases(
    archived: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker("canvas:read"))
):
    """List all canvases owned by or shared with the current user."""
    # Get user's role IDs
    user_role_ids = [role.id for role in current_user.roles]
    
    query = db.query(Canvas).filter(
        or_(
            Canvas.owner_id == current_user.id,
            Canvas.allowed_users.any(id=current_user.id),
            Canvas.allowed_roles.any(Role.id.in_(user_role_ids))
        )
    )
    
    # Filter by archived status
    query = query.filter(Canvas.is_archived == archived)
    
    # Sort by position (ASC) then updated_at (DESC)
    from sqlalchemy import desc, asc
    query = query.order_by(Canvas.position.asc(), Canvas.updated_at.desc())

    canvases = query.all()
    for canvas in canvases:
        # Calculate effective level for the listing
        canvas.access_level = _get_canvas_access_level(canvas, current_user)
        # Populate legacy fields for frontend compatibility
        canvas.user_permissions = canvas.user_permissions
        canvas.role_permissions = canvas.role_permissions
    return canvases


@router.post("/canvases/reorder")
def reorder_canvases(
    updates: List[Dict[str, Any]],
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker("canvas:write"))
):
    """Reorder canvases."""
    # updates is a list of {id: str, position: int}
    ids = [u["id"] for u in updates]
    
    # Verify ownership/access for all IDs
    # For simplicity, we only allow owner to reorder their own canvases
    # Or should we allow non-owners to reorder their view?
    # Viewport/OwnerConfig is stored on shared canvas, so position is currently shared globally (on the Canvas model).
    # This means if I move it, it moves for everyone. Ideally it should be UserCanvasAssociation, but that's a big refactor.
    # User accepted side effects. So shared order is the way.
    
    user_role_ids = [role.id for role in current_user.roles]
    canvases = db.query(Canvas).filter(
        Canvas.id.in_(ids)
    ).all()
    
    # Verify write access for each
    for canvas in canvases:
        if _get_canvas_access_level(canvas, current_user) != "write":
             raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"No write access to canvas {canvas.id}"
            )
    
    # Map for quick lookup
    canvas_map = {c.id: c for c in canvases}
    
    for update in updates:
        cid = update["id"]
        if cid in canvas_map:
            canvas_map[cid].position = update["position"]
            flag_modified(canvas_map[cid], "position")
            
    db.commit()
    return {"status": "success"}


def _enrich_links(db: Session, links: List[CanvasLink]) -> List[Dict[str, Any]]:
    """
    Enrich link objects with target titles and names for cross-canvas links.
    Returns a list of dictionaries compatible with LinkResponse.
    """
    response_links = []
    
    # Identify cross-canvas targets for batch fetching
    target_canvas_ids = set()
    target_ids = set()
    
    # Pre-process to find what we need to fetch
    for link in links:
        if link.target_canvas_id:
            target_canvas_ids.add(link.target_canvas_id)
            target_ids.add(link.target_id)
            
    # Batch Fetch Maps
    canvas_map = {}
    if target_canvas_ids:
        found_canvases = db.query(Canvas).filter(Canvas.id.in_(target_canvas_ids)).all()
        canvas_map = {c.id: c.name for c in found_canvases}
        
    thing_map = {}
    if target_ids:
        # Try finding Things first
        found_things = db.query(CanvasThing).filter(CanvasThing.id.in_(target_ids)).all()
        for t in found_things:
            thing_map[t.id] = t.title or t.type.value
            
        # Also check Domains if not found (since links can target domains)
        missing_ids = target_ids - set(thing_map.keys())
        if missing_ids:
            found_domains = db.query(Domain).filter(Domain.id.in_(missing_ids)).all()
            for d in found_domains:
                thing_map[d.id] = d.name

    # Transform and Enrich
    for link in links:
        # Convert SQLAlchemy model to dict (safe way)
        l_dict = {
            "id": link.id,
            "canvas_id": link.canvas_id,
            "source_id": link.source_id,
            "target_id": link.target_id,
            "type": link.type,
            "label": link.label,
            "description": link.description,
            "source_fragment": link.source_fragment,
            "target_fragment": link.target_fragment,
            "target_canvas_id": link.target_canvas_id,
            "created_at": link.created_at
        }
        
        # Enrich if external
        if link.target_canvas_id:
             l_dict["target_canvas_name"] = canvas_map.get(link.target_canvas_id)
             l_dict["target_thing_title"] = thing_map.get(link.target_id)
             
        response_links.append(l_dict)
        
    return response_links


@router.get("/canvases/{canvas_id}", response_model=CanvasWithContents)
def get_canvas(
    canvas_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker("canvas:read"))
):
    # Use helper for permission check
    canvas = _get_canvas_with_access(canvas_id, db, current_user)
    
    # Manual construction of response to include enriched links
    # Convert Canvas model to dict-like structure suitable for Pydantic
    # Note: access lazily loaded relationships now
    
    # Enrich links
    enriched_links = _enrich_links(db, canvas.links)
    
    # Use Pydantic's from_attributes mechanism partially by creating an instance
    # OR simpler: return a dict matching the schema.
    
    # Merge on Read: Enrich owner_config with latest Scenario configuration
    # This ensures dynamic inheritance of automations, UI overrides, and tool definitions.
    merged_config = dict(canvas.owner_config or {})
    scenario_id = merged_config.get("scenario_id")
    if scenario_id:
        from app.models.scenario_models import Scenario
        scenario = db.query(Scenario).filter(Scenario.id == scenario_id).first()
        if scenario:
            scen_config = scenario.configuration
            
            # 1. Automations (Scenario is source of truth)
            if scen_config.get("automations"):
                merged_config["automations"] = scen_config.get("automations")
                
            # 2. UI Overrides (Theme, Toolbar, etc.)
            if scen_config.get("ui_overrides"):
                merged_config["ui_overrides"] = scen_config.get("ui_overrides")

            # 3. Domain Definitions (Available types)
            if scen_config.get("domain_definitions"):
                merged_config["domain_definitions"] = scen_config.get("domain_definitions")

            # 4. Link Types
            if scen_config.get("link_types"):
                merged_config["link_types"] = scen_config.get("link_types")
                
            # 5. Theme Color (Dynamic from Scenario Model)
            if scenario.theme_color:
                merged_config["theme_color"] = scenario.theme_color

    response = CanvasWithContents(
        id=canvas.id,
        owner_id=canvas.owner_id,
        name=canvas.name,
        description=canvas.description,
        viewport=canvas.viewport,
        user_permissions=[
            {"user_id": p.user_id, "level": p.permission_level} 
            for p in canvas.user_permissions
        ],
        role_permissions=[
            {"role_id": p.role_id, "level": p.permission_level}
            for p in canvas.role_permissions
        ],
        owner_config=merged_config,
        position=canvas.position,
        analysis_space_id=canvas.analysis_space_id,
        access_level=canvas.access_level,
        created_at=canvas.created_at,
        updated_at=canvas.updated_at,
        things=canvas.things,
        links=enriched_links,
        domains=canvas.domains
    )
    
    return response


@router.patch("/canvases/{canvas_id}", response_model=CanvasResponse)
def update_canvas(
    canvas_id: str,
    request: CanvasUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker("canvas:write"))
):
    """Update canvas properties."""
    print(f"[CanvasRouter] PATCH /canvases/{canvas_id} reached. Request: {request.model_dump()}")
    # Only owner or explicit write access (treated same as read for now) can update
    # Ideally, we should check for "Write" permission if we had granular permissions.
    canvas = _get_canvas_with_access(canvas_id, db, current_user, require_write=True)
    
    # Update fields
    if request.name is not None:
        canvas.name = request.name
    if request.description is not None:
        canvas.description = request.description
    if request.viewport is not None:
        canvas.viewport = request.viewport.model_dump()

    # Update owner_config if provided
    if request.owner_config is not None:
        toolbar_conf = request.owner_config.get('toolbar_config', {})
        model = request.owner_config.get('llm_model') or request.owner_config.get('model') or toolbar_conf.get('llm_model')
        vision_model = request.owner_config.get('vision_model') or toolbar_conf.get('vision_model')
        print(f"[CanvasRouter] Saving canvas {canvas_id} config. LLM: {model}, Vision: {vision_model}")
        if model or vision_model:
            print(f"[CanvasRouter] MODEL SELECTION CHANGE for {canvas_id}:")
            if model: print(f"  - LLM Model: {model}")
            if vision_model: print(f"  - Vision Model: {vision_model}")
        
        if request.owner_config.get('automations'):
             print(f"[CanvasRouter] Updating automations for {canvas_id}. Count: {len(request.owner_config['automations'])}")

        # Merge with existing config to prevent overwriting
        current_config = dict(canvas.owner_config or {}) # Force copy to ensure mutation detection?
        
        # Ensure it's a dict (handle potential None or weird state)
        if not isinstance(current_config, dict):
            current_config = {}
            
        current_config.update(request.owner_config)
        canvas.owner_config = current_config
        flag_modified(canvas, "owner_config")
        
    # Update Permissions (Only Owner can change permissions)
    if (request.user_permissions is not None or request.role_permissions is not None) and canvas.owner_id != current_user.id:
        raise HTTPException(
             status_code=status.HTTP_403_FORBIDDEN,
             detail="Only the owner can manage permissions"
        )

    if request.user_permissions is not None:
        # Clear existing and re-add
        db.query(CanvasUser).filter(CanvasUser.canvas_id == canvas_id).delete()
        for p in request.user_permissions:
            assoc = CanvasUser(user_id=p.user_id, permission_level=p.level.value)
            canvas.user_permissions.append(assoc)
        
    if request.role_permissions is not None:
        db.query(CanvasRole).filter(CanvasRole.canvas_id == canvas_id).delete()
        for p in request.role_permissions:
            assoc = CanvasRole(role_id=p.role_id, permission_level=p.level.value)
            canvas.role_permissions.append(assoc)
    db.commit()
    db.refresh(canvas)
    return canvas

@router.post("/canvases/{canvas_id}/events")
async def report_canvas_event(
    canvas_id: str,
    request: CanvasEventRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Report a spatial event (hook) from the frontend.
    Triggers matching automations defined in the scenario.
    """
    # Permission check
    _get_canvas_with_access(canvas_id, db, current_user)
    
    # Process event
    results = await automation_service.handle_canvas_event(
        db=db,
        canvas_id=canvas_id,
        hook=request.hook,
        payload=request.payload,
        user_id=current_user.id
    )
    
    return {"status": "processed", "triggered_count": len(results), "details": results}

@router.post("/canvases/{canvas_id}/auto-rename", response_model=dict)
async def auto_rename_canvas(
    canvas_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Automatically rename the canvas based on its content using LLM."""
    from app.services.llm_service import llm_service
    
    # 1. Fetch canvas with things
    # Use helper for permission check
    canvas = _get_canvas_with_access(canvas_id, db, current_user, require_write=True)
    
    if not canvas:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Canvas not found or access denied"
        )
        
    # 2. Aggregate content
    things = db.query(CanvasThing).filter(CanvasThing.canvas_id == canvas_id).all()
    if not things:
        return {"status": "skipped", "message": "Canvas is empty", "name": canvas.name}
        
    content_parts = []
    for t in things:
        # Include title if meaningful
        if t.title and not t.title.startswith("New ") and len(t.title) > 3:
            content_parts.append(f"Title: {t.title}")
            
        # Include content based on type
        if t.type == "text" and t.content:
            text_val = t.content.get("text", "")
            if isinstance(text_val, str):
                content_parts.append(text_val[:500]) # Cap per node
            elif isinstance(text_val, dict) or isinstance(text_val, list):
                 # Handle cases where text might be rich text JSON or list
                 content_parts.append(str(text_val)[:500])
        elif t.type == "conversation":
            # For chats, maybe just the last few messages or summary?
            # Analyzing chat history is expensive, let's skip deep analysis for canvas rename
            # and rely on title if it was auto-generated
            pass
            
    full_text = "\n".join(content_parts)
    if len(full_text) < 10:
         return {"status": "skipped", "message": "Not enough content to generate name", "name": canvas.name}

    # 3. Generate Title
    new_title = await llm_service.generate_title(full_text, type="canvas")
    
    # 4. Update
    canvas.name = new_title
    db.commit()
    
    return {"status": "success", "name": new_title}

@router.delete("/canvases/{canvas_id}")
def delete_canvas(
    canvas_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Delete a canvas and all its contents."""
    canvas = _get_canvas_with_access(canvas_id, db, current_user, require_write=True)
    
    # Cascade delete assets
    from app.services.asset_service import asset_service
    from app.services.rag_service import rag_service
    
    # 1. Collect assets to delete
    assets_to_delete = []
    
    # We need to query things manually first because cascade delete happens at DB level 
    # and we won't have access to them after commit, but we need their content NOW.
    things = db.query(CanvasThing).filter(CanvasThing.canvas_id == canvas_id).all()
    
    for thing in things:
        # Check for Asset ID
        asset_id = thing.content.get("asset_id")
        if asset_id:
            assets_to_delete.append(asset_id)
            
        # Check for URL/Text RAG entries that aren't assets
        # If it's a URL or Text node that was vectorized, we should clean up RAG
        # Note: Generic RAG cleanup usually relies on 'source' metadata.
        # For URLs, source is the URL. For Text, source is 'TEXT_CONTENT_MODE'.
        # However, RAG Service doesn't easily support "delete by metadata" except via specific source path.
        # Ideally, we'd have a delete_by_thing_id or similar.
        # For now, let's focus on Assets which are the big disk users.
            
    # 2. Delete Assets
    for asset_id in assets_to_delete:
        try:
            print(f"[CanvasRouter] Cascade deleting asset {asset_id}")
            asset_service.delete_asset(db, asset_id, current_user.id)
        except Exception as e:
             print(f"[CanvasRouter] Error deleting asset {asset_id}: {e}")

    # 3. Delete from RAG (Vector Store) directly using canvas_id
    try:
        print(f"[CanvasRouter] Deleting RAG embeddings for canvas {canvas_id}")
        rag_service.delete_by_canvas(canvas_id)
    except Exception as e:
        print(f"[CanvasRouter] Error deleting RAG embeddings for canvas {canvas_id}: {e}")

    db.delete(canvas)
    db.commit()
    
    # 4. Trigger VACUUM to reclaim space after large deletion
    try:
        rag_service.clear_database_cache()
    except Exception as e:
        print(f"[CanvasRouter] Failed to vacuum after canvas deletion: {e}")

    return {"message": "Canvas deleted"}


@router.patch("/canvases/{canvas_id}/archive")
def archive_canvas(
    canvas_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Archive a canvas."""
    canvas = _get_canvas_with_access(canvas_id, db, current_user, require_write=True)
        
    canvas.is_archived = True
    db.commit()
    return {"status": "success"}


@router.patch("/canvases/{canvas_id}/restore")
def restore_canvas(
    canvas_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Restore an archived canvas."""
    canvas = _get_canvas_with_access(canvas_id, db, current_user, require_write=True)
        
    canvas.is_archived = False
    db.commit()
    return {"status": "success"}


@router.get("/canvases/{canvas_id}/export")
def export_canvas(
    canvas_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Export a canvas and all its contents as JSON."""
    canvas = _get_canvas_with_access(canvas_id, db, current_user)
        
    # Construct export data
    # Recursively dump data
    
    # Things
    things_data = []
    for t in canvas.things:
        thing_dict = {
            "id": t.id, # Keep existing ID for re-linking within export, but import should map new IDs
            "type": t.type.value,
            "content": t.content,
            "position_x": t.position_x,
            "position_y": t.position_y,
            "width": t.width,
            "height": t.height,
            "domain_id": t.domain_id,
            "summaries": t.summaries,
            "title": t.title,
            "collapsed": t.collapsed,
            "iconified": t.iconified,
            "pre_iconify_size": t.pre_iconify_size,
            "rag_status": t.rag_status
        }
        things_data.append(thing_dict)
        
    # Links
    links_data = []
    for l in canvas.links:
        link_dict = {
            "source_id": l.source_id,
            "target_id": l.target_id,
            "type": l.type, # Fix: l.type is now a string
            "label": l.label,
            "description": l.description,
            "source_fragment": l.source_fragment,
            "target_fragment": l.target_fragment
        }
        links_data.append(link_dict)
        
    # Domains
    domains_data = []
    for d in canvas.domains:
        domain_dict = {
            "id": d.id,
            "parent_id": d.parent_id,
            "name": d.name,
            "description": d.description,
            "color": d.color,
            "position_x": d.position_x,
            "position_y": d.position_y,
            "width": d.width,
            "height": d.height,
            "type": d.type,
            "visual_config": d.visual_config,
            "metadata_schema": d.metadata_schema,
            "metadata_values": d.metadata_values,
            "drop_zones": d.drop_zones
        }
        domains_data.append(domain_dict)
        
    export_payload = {
        "schema_version": "1.0",
        "canvas": {
            "name": canvas.name,
            "description": canvas.description,
            "viewport": canvas.viewport
        },
        "things": things_data,
        "links": links_data,
        "domains": domains_data
    }
    
    return export_payload


@router.post("/canvases/import")
def import_canvas(
    data: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Import a canvas from JSON export data."""
    try:
        # 1. Create Canvas
        canvas_info = data.get("canvas", {})
        new_canvas = Canvas(
            owner_id=current_user.id,
            name=f"{canvas_info.get('name', 'Imported Canvas')} (Imported)",
            description=canvas_info.get("description"),
            viewport=canvas_info.get("viewport", {"x": 0, "y": 0, "zoom": 1.0}),
            is_archived=False
        )
        db.add(new_canvas)
        db.flush() # Generate ID
        
        # Maps for ID translation (Old -> New)
        id_map = {} # Generic map for things and domains
        
        # 2. Key for re-mapping domain IDs first since things depend on them
        domains_data = data.get("domains", [])
        # Simple topological sort not needed if we insert parents first or just update parents later.
        # But domains can be nested. SQLAlchemy handles FK checks.
        # Safest: Insert all Domains with Null parent, then update parents.
        new_domains = []
        old_domain_parent_map = {}
        
        for d_data in domains_data:
            old_id = d_data.get("id")
            new_domain = Domain(
                canvas_id=new_canvas.id,
                name=d_data.get("name"),
                description=d_data.get("description"),
                color=d_data.get("color"),
                position_x=d_data.get("position_x"),
                position_y=d_data.get("position_y"),
                width=d_data.get("width"),
                height=d_data.get("height"),
                type=d_data.get("type"),
                visual_config=d_data.get("visual_config"),
                metadata_schema=d_data.get("metadata_schema"),
                metadata_values=d_data.get("metadata_values"),
                drop_zones=d_data.get("drop_zones"),
                parent_id=None # Set later
            )
            db.add(new_domain)
            db.flush()
            if old_id:
                id_map[old_id] = new_domain.id
                if d_data.get("parent_id"):
                    old_domain_parent_map[new_domain.id] = d_data.get("parent_id")
                    
        # Update Domain parents
        for new_dom_id, old_parent_id in old_domain_parent_map.items():
            if old_parent_id in id_map:
                dom = db.query(Domain).filter(Domain.id == new_dom_id).first()
                dom.parent_id = id_map[old_parent_id]
        
        # 3. Create Things
        things_data = data.get("things", [])
        for t_data in things_data:
            old_id = t_data.get("id")
            old_domain_id = t_data.get("domain_id")
            
            # Map domain ID
            new_domain_id = id_map.get(old_domain_id) if old_domain_id else None
            
            new_thing = CanvasThing(
                canvas_id=new_canvas.id,
                type=ModelThingType(t_data.get("type")),
                content=t_data.get("content", {}),
                position_x=t_data.get("position_x"),
                position_y=t_data.get("position_y"),
                width=t_data.get("width"),
                height=t_data.get("height"),
                domain_id=new_domain_id,
                summaries=t_data.get("summaries", {}),
                title=t_data.get("title"),
                collapsed=t_data.get("collapsed", False),
                iconified=t_data.get("iconified", False),
                pre_iconify_size=t_data.get("pre_iconify_size"),
                rag_status=t_data.get("rag_status", "none")
            )
            db.add(new_thing)
            db.flush()
            if old_id:
                id_map[old_id] = new_thing.id
                
        # 4. Create Links
        links_data = data.get("links", [])
        for l_data in links_data:
            s_old = l_data.get("source_id")
            t_old = l_data.get("target_id")
            
            if s_old in id_map and t_old in id_map:
                new_link = CanvasLink(
                    canvas_id=new_canvas.id,
                    source_id=id_map[s_old],
                    target_id=id_map[t_old],
                    type=ModelLinkType(l_data.get("type", "related")),
                    label=l_data.get("label"),
                    source_fragment=l_data.get("source_fragment"),
                    target_fragment=l_data.get("target_fragment")
                )
                db.add(new_link)
                
        db.commit()
        db.refresh(new_canvas)
        return {"status": "success", "id": new_canvas.id}
        
    except Exception as e:
        db.rollback()
        print(f"Import failed: {e}")
        # traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Import failed: {str(e)}")


# =============================================================================
# Things CRUD
# =============================================================================

@router.get("/canvases/things/{thing_id}", response_model=ThingResponse)
def get_thing(
    thing_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Get a single thing by its ID."""
    thing = db.query(CanvasThing).filter(CanvasThing.id == thing_id).first()
    if not thing:
        raise HTTPException(status_code=404, detail="Thing not found")
        
    # Optional: check if user has access to the parent canvas
    _get_canvas_with_access(thing.canvas_id, db, current_user, require_write=False)
    
    return thing

@router.post("/canvases/{canvas_id}/things/{thing_id}/vectorize", response_model=Dict[str, Any])
def trigger_vectorization(
    canvas_id: str,
    thing_id: str,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker("canvas:write"))
):
    """
    Manually trigger RAG vectorization for a thing.
    Useful for retrying failed items or processing text nodes created before auto-ingestion.
    """
    thing = db.query(CanvasThing).filter(
        CanvasThing.canvas_id == canvas_id,
        CanvasThing.id == thing_id
    ).first()

    if not thing:
        raise HTTPException(status_code=404, detail="Thing not found")

    # Re-use logic to determine path
    real_path = None
    asset_id = thing.content.get("asset_id")

    if asset_id:
        from app.models.asset_models import Asset
        from app.services.asset_service import STORAGE_ROOT
        
        asset_record = db.query(Asset).filter(Asset.id == asset_id).first()
        if asset_record:
            full_path = STORAGE_ROOT / asset_record.file_path
            if full_path.exists():
                real_path = str(full_path)
            else:
                 raise HTTPException(status_code=404, detail=f"Asset file not found on disk")
        else:
             raise HTTPException(status_code=404, detail=f"Asset record {asset_id} not found")

    if thing.content.get("source_type") == "image_folder":
        real_path = "IMAGE_FOLDER_MODE"

    if thing.type == ModelThingType.TEXT or (thing.type == ModelThingType.DOCUMENT and not asset_id and thing.content.get("content")):
        real_path = "TEXT_CONTENT_MODE"

    if not real_path:
        raise HTTPException(status_code=400, detail="Cannot vectorize this item (No valid asset or text content)")

    # Set status to PENDING
    thing.rag_status = RAGStatus.PENDING
    db.commit() 
    
    # Trigger Worker
    from app.routers.canvas_worker import handle_async_vectorization
    background_tasks.add_task(
        handle_async_vectorization, 
        thing.id,
        real_path, 
        canvas_id
    )

    return {"status": "triggered", "thing_id": thing.id}
@router.post("/canvases/{canvas_id}/things", response_model=ThingResponse)
async def create_thing(
    canvas_id: str,
    request: ThingCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker("canvas:write"))
):
    """Add a thing to the canvas."""
    print(f"[CanvasRouter] Received create_thing request for canvas {canvas_id}, type: {request.type}")
    print(f"[CanvasRouter] Request Domain ID: {request.domain_id}")
    try:
        canvas = _get_canvas_with_access(canvas_id, db, current_user, require_write=True)
        
        technical_metadata = request.technical_metadata or {}
        
        # Enrich Technical Metadata if asset exists
        asset_id = request.content.get("asset_id")
        if asset_id:
            from app.models.asset_models import Asset
            asset_record = db.query(Asset).filter(Asset.id == asset_id).first()
            if asset_record:
                technical_metadata.update({
                    "file_name": asset_record.original_name,
                    "mime_type": asset_record.mime_type,
                    "file_size": asset_record.size_bytes,
                    "source_type": request.content.get("source_type") or request.type.value
                })
                # Check for hash if it was passed in content
                if request.content.get("file_hash"):
                    technical_metadata["file_hash"] = request.content.get("file_hash")

        thing = CanvasThing(
            canvas_id=canvas_id,
            type=ModelThingType(request.type.value),
            content=request.content,
            technical_metadata=technical_metadata,
            custom_metadata=request.custom_metadata,
            position_x=request.position.x,
            position_y=request.position.y,
            width=request.size.width if request.size else None,
            height=request.size.height if request.size else None,
            domain_id=request.domain_id if request.domain_id else None,
            title=request.title,
            color=request.color
        )
        print(f"[CanvasRouter] Adding thing to DB: {thing}")
        db.add(thing)
        db.commit()
        db.refresh(thing)
        print(f"[CanvasRouter] Thing created successfully: {thing.id}")

        # Trigger RAG Ingestion for Documents, Images, Slideshows, Text, and URLs
        if thing.type in [ModelThingType.DOCUMENT, ModelThingType.IMAGE, ModelThingType.SLIDESHOW, ModelThingType.TEXT, ModelThingType.URL]:
            try:
                # Logic to find the file execution.
                asset_id = thing.content.get("asset_id")
                
                real_path = None
                
                if asset_id:
                     # ... (keep existing asset logic)
                     from app.models.asset_models import Asset
                     from app.services.asset_service import STORAGE_ROOT
                     
                     asset_record = db.query(Asset).filter(Asset.id == asset_id).first()
                     if asset_record:
                         full_path = STORAGE_ROOT / asset_record.file_path
                         if full_path.exists():
                             real_path = str(full_path)
                             if asset_record.original_name.lower().endswith(".pptx"):
                                 thing.type = ModelThingType.SLIDESHOW
                         else:
                             print(f"[CanvasRouter] Asset file missing on disk: {full_path}")
                
                if thing.content.get("source_type") == "image_folder":
                    real_path = "IMAGE_FOLDER_MODE"

                if thing.type == ModelThingType.TEXT or (thing.type == ModelThingType.DOCUMENT and not asset_id and thing.content.get("content")):
                    real_path = "TEXT_CONTENT_MODE"
                
                if thing.type == ModelThingType.URL:
                    real_path = thing.content.get("url")
                    print(f"[CanvasRouter] Identified URL Thing. Triggering worker for scraping.")

                if real_path:
                    if thing.type == ModelThingType.DOCUMENT and asset_id:
                        ct = dict(thing.content)
                        ct["file_path"] = f"/api/v1/assets/{asset_id}"
                        ct["filename"] = asset_record.original_name if asset_record else "document.pdf"
                        thing.content = ct                        
                        from sqlalchemy.orm.attributes import flag_modified
                        flag_modified(thing, "content")
                        db.commit()

                    print(f"[CanvasRouter] Triggering Async Vectorization for {real_path}")
                    
                    thing.rag_status = RAGStatus.PENDING
                    db.commit()
                    
                    background_tasks.add_task(
                        handle_async_vectorization, 
                        thing.id,
                        real_path, 
                        canvas_id,
                        scrape_options=request.scrape_options.model_dump() if request.scrape_options else None
                    )
                else:
                    print(f"[CanvasRouter] Could not determine local file path for asset {asset_id}")

            except Exception as e:
                print(f"[CanvasRouter] RAG Ingestion Setup Error: {e}")

        # Ensure we return the absolute latest state (including status updates)
        db.refresh(thing)
        return thing

        return thing
    except Exception as e:
        print(f"[CanvasRouter] Error creating thing: {e}")
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create thing: {str(e)}"
        )


@router.get(
    "/canvases/{canvas_id}/things",
    response_model=List[ThingResponse]
)
def list_things(
    canvas_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker("canvas:read"))
):
    """List all things on a canvas."""
    canvas = _get_canvas_with_access(canvas_id, db, current_user)
    
    # Debug log removed to prevent console flooding
    # for t in canvas.things:
    #     if t.type.value == "image" or t.content.get("generated_description"):
    #          print(f"[CanvasRouter] ListThings: Thing {t.id} ({t.type.value}). Keys: {t.content.keys()}")

    return canvas.things


@router.get(
    "/canvases/{canvas_id}/things/{thing_id}",
    response_model=ThingResponse
)
def get_thing(
    canvas_id: str,
    thing_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Get a specific thing from the canvas."""
    canvas = _get_canvas_with_access(canvas_id, db, current_user)
    
    thing = db.query(CanvasThing).filter(
        CanvasThing.id == thing_id,
        CanvasThing.canvas_id == canvas_id
    ).first()
    
    if not thing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Thing not found"
        )
    return thing


@router.patch(
    "/canvases/{canvas_id}/things/{thing_id}",
    response_model=ThingResponse
)
def update_thing(
    canvas_id: str,
    thing_id: str,
    request: ThingUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Update a thing's properties."""
    canvas = _get_canvas_with_access(canvas_id, db, current_user, require_write=True)
    
    thing = db.query(CanvasThing).filter(
        CanvasThing.id == thing_id,
        CanvasThing.canvas_id == canvas_id
    ).first()
    
    if not thing:
        # DEBUG: Find out why
        debug_thing = db.query(CanvasThing).filter(CanvasThing.id == thing_id).first()
        if not debug_thing:
            print(f"[CanvasRouter] Update Error: Thing {thing_id} does not exist in DB.")
        else:
            print(f"[CanvasRouter] Update Error: Thing {thing_id} exists. CanvasID: {debug_thing.canvas_id} (Req: {canvas_id}). Owner mismatch?")
            
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Thing not found or access denied"
        )
    
    from sqlalchemy.orm.attributes import flag_modified
    
    # Update fields
    # Update fields
    if request.content is not None:
        print(f"[CanvasRouter] Updating thing {thing_id} content. Regions: {request.content.get('regions')}")
        
        # Robust Merge: Protect critical VLM fields from being overwritten by stale frontend state
        existing_content = thing.content or {}
        new_content = request.content.copy() # Ensure we don't modify the input
        
        preserved_fields = [
            "description", "generated_description", "vision_model", "source_image", "generated_at",
            "execution_plan", "analysis_result", "processing_status"
        ]
        for field in preserved_fields:
            # If the field exists in DB but is missing/empty in the request, keep the DB version
            # This handles the case where frontend sends a stale 'content' object without the async-generated details
            if existing_content.get(field) and not new_content.get(field):
                print(f"[CanvasRouter] Preserving critical field '{field}' during update.")
                new_content[field] = existing_content[field]
        
        thing.content = new_content
        flag_modified(thing, "content") # Explicitly flag JSON as modified
        print(f"[CanvasRouter] Content updated and flagged modified. Keys: {new_content.keys()}. STATUS IS: {new_content.get('status')}")
    if request.position is not None:
        thing.position_x = request.position.x
        thing.position_y = request.position.y
    if request.size is not None:
        thing.width = request.size.width
        thing.height = request.size.height
    if request.domain_id is not None:
        thing.domain_id = request.domain_id if request.domain_id else None
    if request.title is not None:
        thing.title = request.title

    if request.technical_metadata is not None:
        current_tech = dict(thing.technical_metadata or {})
        current_tech.update(request.technical_metadata)
        thing.technical_metadata = current_tech

    if request.custom_metadata is not None:
        current_custom = dict(thing.custom_metadata or {})
        current_custom.update(request.custom_metadata)
        thing.custom_metadata = current_custom
        
    if request.technical_metadata is not None:
        current_tech = dict(thing.technical_metadata or {})
        current_tech.update(request.technical_metadata)
        thing.technical_metadata = current_tech

    if request.custom_metadata is not None:
        current_custom = dict(thing.custom_metadata or {})
        current_custom.update(request.custom_metadata)
        thing.custom_metadata = current_custom
        
        # Sync title to Conversation service if applicable
        if thing.type == "conversation" and thing.content and "conversation_id" in thing.content:
             try:
                 from app.services.conversation_service import conversation_service
                 conversation_service.update_conversation(
                     thing.content["conversation_id"], 
                     {"title": request.title}
                 )
             except Exception as e:
                 print(f"[CanvasRouter] Failed to sync conversation title: {e}")
    if request.color is not None:
        thing.color = request.color
    if request.collapsed is not None:
        thing.collapsed = request.collapsed
    # Iconify feature fields
    if request.iconified is not None:
        thing.iconified = request.iconified
    if request.pre_iconify_size is not None:
        thing.pre_iconify_size = request.pre_iconify_size
    
    db.commit()
    db.refresh(thing)
    return thing


@router.post(
    "/canvases/{canvas_id}/things/{thing_id}/stop-rag",
    response_model=ThingResponse
)
def stop_thing_rag(
    canvas_id: str,
    thing_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Manually stop the RAG / Scraping process for a thing.
    This sets the status to FAILED, which the background worker checks for cancellation.
    """
    canvas = _get_canvas_with_access(canvas_id, db, current_user)
    
    thing = db.query(CanvasThing).filter(
        CanvasThing.id == thing_id,
        CanvasThing.canvas_id == canvas_id
    ).first()
    
    if not thing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Thing not found or access denied"
        )
    
    # Set status to FAILED to trigger cancellation in background worker
    thing.rag_status = RAGStatus.FAILED
    
    # Also update progress state to show it was stopped
    if thing.content and "ingestion_progress" in thing.content:
        new_content = dict(thing.content)
        progress = dict(new_content.get("ingestion_progress", {}))
        progress["status"] = "stopped"
        new_content["ingestion_progress"] = progress
        thing.content = new_content
        flag_modified(thing, "content")
        
    db.commit()
    db.refresh(thing)
    return thing


@router.delete("/canvases/{canvas_id}/things/{thing_id}")
def delete_thing(
    canvas_id: str,
    thing_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Delete a thing from the canvas."""
    canvas = _get_canvas_with_access(canvas_id, db, current_user, require_write=True)

    thing = db.query(CanvasThing).filter(
        CanvasThing.id == thing_id,
        CanvasThing.canvas_id == canvas_id
    ).first()
    
    if not thing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Thing not found"
        )
    
    
    # Clean up RAG embeddings directly via thing_id 
    try:
        print(f"[CanvasRouter] Deleting RAG embeddings for thing {thing_id}")
        rag_service.delete_by_thing(thing_id)
    except Exception as e:
        print(f"[CanvasRouter] Error deleting RAG embeddings for thing {thing_id}: {e}")

    db.delete(thing)
    db.commit()
    return {"message": "Thing deleted"}


# =============================================================================
# Sync / Re-ingestion Logic
# =============================================================================
from app.models.asset_models import Asset
from app.services.asset_service import AssetService
import os
import uuid
import datetime
from fastapi import UploadFile, File, Form, BackgroundTasks

@router.post("/canvases/{canvas_id}/things/{thing_id}/sync/check")
def check_sync_status(
    canvas_id: str,
    thing_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Check if the thing's source file has changed.
    Uses 'source_path' from technical_metadata (primary) or content (legacy).
    """
    thing = db.query(CanvasThing).join(Canvas).filter(
        CanvasThing.id == thing_id,
        CanvasThing.canvas_id == canvas_id
    ).first()
    
    if not thing:
        raise HTTPException(status_code=404, detail="Thing not found")

    content = thing.content or {}
    asset_id = content.get("asset_id")
    
    if not asset_id:
         return {"status": "no_asset"}
         
    asset = db.query(Asset).filter(Asset.id == asset_id).first()
    if not asset:
        return {"status": "asset_missing"}
        
    # Retrieve source path from technical_metadata (primary) or content (legacy)
    tech_meta = thing.technical_metadata or {}
    source_path = tech_meta.get("source_path") or content.get("source_path")
    
    stored_hash = content.get("file_hash")
    
    # NEW: Default Path Resolution
    if not source_path:
        owner_config = thing.canvas.owner_config or {}
        default_path = owner_config.get("default_source_path")
        if default_path:
            # Try to construct path from filename
            filename = content.get("filename") or (asset.original_name if asset else None)
            if filename:
                candidate_path = os.path.join(default_path, filename)
                if os.path.exists(candidate_path):
                    source_path = candidate_path

    if not source_path:
        # If no source path known, we can't check disk.
        return {"status": "missing_source", "reason": "no_source_path"}
        
    if not os.path.exists(source_path):
        return {"status": "missing_source", "path": source_path}
        
    # Checksum verification
    try:
        current_hash = AssetService.calculate_file_hash(source_path)
        
        # If no stored hash (old thing), update it via sync
        if not stored_hash:
             return {"status": "changed", "reason": "no_stored_hash"}
             
        if current_hash != stored_hash:
            return {"status": "changed", "current_hash": current_hash, "stored_hash": stored_hash}
            
        return {"status": "synced", "last_checked": str(datetime.datetime.utcnow())}
        
    except Exception as e:
        print(f"[SyncCheck] Error calculating hash: {e}")
        return {"status": "error", "message": str(e)}


@router.post("/canvases/{canvas_id}/things/{thing_id}/sync/update")
async def perform_sync_update(
    canvas_id: str,
    thing_id: str,
    file: Optional[UploadFile] = File(None),
    use_source_path: bool = Form(False),
    new_source_path: Optional[str] = Form(None),
    background_tasks: BackgroundTasks = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Perform the sync update.
    Two-Phase: Ingest New -> Delete Old.
    """
    thing = db.query(CanvasThing).join(Canvas).filter(
        CanvasThing.id == thing_id,
        CanvasThing.canvas_id == canvas_id
    ).first()
    
    if not thing:
        raise HTTPException(status_code=404, detail="Thing not found")
        
    content = thing.content or {}
    tech_meta = thing.technical_metadata or {}
    old_asset_id = content.get("asset_id")
    
    new_asset = None
    new_file_hash = None
    source_path_used = None
    
    # 1. Acquire New Data (File Upload OR Read from Source)
    if file:
        # Case A: User selected a new file manually (Manual Update / Relink)
        print(f"[SyncUpdate] Updating from uploaded file: {file.filename}")
        # Unpack tuple (Asset, file_hash)
        new_asset, new_file_hash = await AssetService.create_asset(db, file, current_user.id)
        
        # If user provided a new source path (e.g. pasted in dialog), save it
        if new_source_path:
            source_path_used = new_source_path
        
    elif use_source_path:
        # Case B: Sync from existing source path (stored in tech_meta or content)
        # Prioritize passed-in path, then tech_meta, then content
        source_path = new_source_path or tech_meta.get("source_path") or content.get("source_path")
        
        # NEW: Try Default Path Resolution if explicit path is missing
        if not source_path:
            owner_config = thing.canvas.owner_config or {}
            default_path = owner_config.get("default_source_path")
            if default_path:
                 filename = content.get("filename") or (thing.title if thing.title and "." in thing.title else None)
                 if filename:
                     candidate = os.path.join(default_path, filename)
                     if os.path.exists(candidate):
                         source_path = candidate
                         print(f"[SyncUpdate] Resolved source path from default: {source_path}")

        if not source_path:
             raise HTTPException(status_code=400, detail="No source path available to sync from.")
              
        if not os.path.exists(source_path):
             raise HTTPException(status_code=404, detail=f"Source file not found: {source_path}")
              
        print(f"[SyncUpdate] Updating from source path: {source_path}")
        source_path_used = source_path
        
        # Manually Create Asset from Path to track logic history
        try:
             import mimetypes
             import shutil
             from pathlib import Path
             from app.services.asset_service import STORAGE_ROOT
             
             filename = os.path.basename(source_path)
             mime_type, _ = mimetypes.guess_type(source_path)
              
             AssetService.ensure_storage_dir()
             today = datetime.datetime.now()
             date_path = Path(f"{today.year}/{today.month:02d}/{today.day:02d}")
             full_dir = STORAGE_ROOT / date_path
             full_dir.mkdir(parents=True, exist_ok=True)
              
             file_uuid = str(uuid.uuid4())
             safe_filename = "".join(x for x in filename if x.isalnum() or x in "._- ")
             disk_filename = f"{file_uuid}_{safe_filename}"
             relative_path = str(date_path / disk_filename)
             dest_path = full_dir / disk_filename
              
             shutil.copy2(source_path, dest_path)
              
             file_size = dest_path.stat().st_size
             new_file_hash = AssetService.calculate_file_hash(dest_path)
              
             # Create Asset without source_path/file_hash columns
             new_asset = Asset(
                 owner_id=current_user.id,
                 original_name=filename,
                 mime_type=mime_type or "application/octet-stream",
                 size_bytes=file_size,
                 file_path=relative_path,
                 # source_path/file_hash removed from model
             )
             db.add(new_asset)
             db.commit()
             db.refresh(new_asset)
        except Exception as e:
             print(f"[SyncUpdate] Error copying file from source: {e}")
             raise HTTPException(status_code=500, detail=f"Failed to copy file from source: {e}")
 
    else:
        raise HTTPException(status_code=400, detail="Must provide file or set use_source_path=True")
        
    if not new_asset:
        raise HTTPException(status_code=500, detail="Failed to create new asset")
        
    # 2. Update Thing Content and Metadata
    new_content = dict(thing.content or {})
    new_tech_meta = dict(thing.technical_metadata or {})
    
    # Check if content matches (Hash Comparison)
    # We compare the NEW hash with the OLD hash stored in content
    old_hash = new_content.get("file_hash")
    is_same_content = new_file_hash and old_hash and new_file_hash == old_hash
    
    new_content["asset_id"] = new_asset.id
    new_content["file_path"] = f"/api/v1/assets/{new_asset.id}"
    
    # Update Technical Metadata with asset details
    new_tech_meta.update({
        "file_name": new_asset.original_name,
        "mime_type": new_asset.mime_type,
        "file_size": new_asset.size_bytes,
        "file_hash": new_file_hash
    })

    # Update Hash
    if new_file_hash:
        new_content["file_hash"] = new_file_hash

    # Update Source Path in Technical Metadata
    if source_path_used:
        new_tech_meta["source_path"] = source_path_used
        # Also update legacy content field for compatibility, or remove it?
        # Let's keep it sync'd for now
        new_content["source_path"] = source_path_used

    thing.content = new_content
    thing.technical_metadata = new_tech_meta
    from sqlalchemy.orm.attributes import flag_modified
    flag_modified(thing, "content")
    flag_modified(thing, "technical_metadata")
    db.commit()
    
    # 3. Trigger 2-Phase Worker (Only if content changed)
    batch_id = str(uuid.uuid4())
    
    if not is_same_content:
        print(f"[SyncUpdate] Triggering worker for {thing_id} with Batch ID: {batch_id}")
        background_tasks.add_task(
            handle_async_vectorization,
            thing_id=thing.id,
            # FIX: Pass Asset object, not string path
            file_path=str(AssetService.get_storage_path(new_asset)), 
            canvas_id=canvas_id,
            mode="sync",
            active_batch_id=batch_id
        )
    else:
        print(f"[SyncUpdate] Content identical. Skipping re-ingestion for {thing_id}.")

    status_code = "sync_same_content" if is_same_content else "sync_started"
    
    return {"status": status_code, "technical_metadata": new_tech_meta, "new_asset_id": new_asset.id}

@router.post("/canvases/{canvas_id}/things/{thing_id}/retry_ingestion")
async def retry_ingestion(
    canvas_id: str,
    thing_id: str,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    thing = db.query(CanvasThing).filter(CanvasThing.id == thing_id, CanvasThing.canvas_id == canvas_id).first()
    if not thing:
         raise HTTPException(status_code=404, detail="Thing not found")
         
    asset_id = thing.content.get("asset_id") if thing.content else None
    real_path = None
    if asset_id:
         from app.models.assets import Asset
         from app.services.asset_service import AssetService
         asset_record = db.query(Asset).filter(Asset.id == asset_id).first()
         if not asset_record:
              raise HTTPException(status_code=404, detail="Associated asset not found")
         real_path = AssetService.get_asset_path(asset_record)
    else:
         source_path = thing.technical_metadata.get("source_path") if thing.technical_metadata else None
         if not source_path:
              raise HTTPException(status_code=400, detail="No asset or source path associated with this thing.")
         real_path = source_path
         
    if not real_path or not os.path.exists(real_path):
         raise HTTPException(status_code=404, detail="File no longer exists on disk")
         
    from app.routers.canvas_worker import handle_async_vectorization
    import uuid
    
    thing.rag_status = RAGStatus.PENDING
    db.commit()
    
    batch_id = str(uuid.uuid4())
    background_tasks.add_task(
        handle_async_vectorization,
        thing_id=thing.id,
        file_path=real_path,
        canvas_id=canvas_id,
        mode="initial",
        active_batch_id=batch_id
    )
    return {"status": "started", "message": "Ingestion restarted"}

@router.post("/canvases/{canvas_id}/things/{thing_id}/retry_ingestion")
async def retry_ingestion(
    canvas_id: str,
    thing_id: str,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    thing = db.query(CanvasThing).filter(CanvasThing.id == thing_id, CanvasThing.canvas_id == canvas_id).first()
    if not thing:
         raise HTTPException(status_code=404, detail="Thing not found")
         
    asset_id = thing.content.get("asset_id") if thing.content else None
    real_path = None
    if asset_id:
         from app.models.asset_models import Asset
         from app.services.asset_service import AssetService
         asset_record = db.query(Asset).filter(Asset.id == asset_id).first()
         if not asset_record:
              raise HTTPException(status_code=404, detail="Associated asset not found")
         real_path = str(AssetService.get_storage_path(asset_record))
    else:
         source_path = thing.technical_metadata.get("source_path") if thing.technical_metadata else None
         if not source_path:
              raise HTTPException(status_code=400, detail="No asset or source path associated with this thing.")
         real_path = source_path
         
    if not real_path or not os.path.exists(real_path):
         raise HTTPException(status_code=404, detail="File no longer exists on disk")
         
    from app.routers.canvas_worker import handle_async_vectorization
    import uuid
    
    thing.rag_status = RAGStatus.PENDING
    db.commit()
    
    batch_id = str(uuid.uuid4())
    background_tasks.add_task(
        handle_async_vectorization,
        thing_id=thing.id,
        file_path=real_path,
        canvas_id=canvas_id,
        mode="initial",
        active_batch_id=batch_id
    )
    return {"status": "started", "message": "Ingestion restarted"}

@router.post("/canvases/{canvas_id}/sync_all")
def sync_all_things(
    canvas_id: str,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker("canvas:write"))
):
    """
    Return status for all syncable things.
    """
    things = db.query(CanvasThing).filter(
        CanvasThing.canvas_id == canvas_id,
        CanvasThing.type.in_([ModelThingType.document, ModelThingType.image, ModelThingType.slideshow])
    ).all()
    
    # Helper to get canvas config once
    canvas = db.query(Canvas).filter(Canvas.id == canvas_id).first()
    owner_config = canvas.owner_config or {} if canvas else {}
    default_path = owner_config.get("default_source_path")
    
    results = []
    for t in things:
        tech_meta = t.technical_metadata or {}
        content = t.content or {}
        source_path = tech_meta.get("source_path") or content.get("source_path")
        
        status_res = "unknown"
        
        # Try default path if missing
        if not source_path and default_path:
             filename = content.get("filename")
             if filename:
                 candidate = os.path.join(default_path, filename)
                 if os.path.exists(candidate):
                     source_path = candidate
        
        if source_path:
            if os.path.exists(source_path):
                status_res = "has_source"
            else:
                status_res = "missing_source"
        else:
            status_res = "no_path"
        
        results.append({
            "thing_id": t.id,
            "title": t.title,
            "status": status_res
        })
        
    return results


# =============================================================================
# Links CRUD
# =============================================================================

@router.post("/canvases/{canvas_id}/links", response_model=LinkResponse)
def create_link(
    canvas_id: str,
    request: LinkCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Create a link between two things."""
    canvas = _get_canvas_with_access(canvas_id, db, current_user, require_write=True)
    
    # Verify source exists (Thing OR Domain)
    source = db.query(CanvasThing).filter(
        CanvasThing.id == request.source_id,
        CanvasThing.canvas_id == canvas_id
    ).first()

    if not source:
        source = db.query(Domain).filter(
            Domain.id == request.source_id,
            Domain.canvas_id == canvas_id
        ).first()

    # Verify target exists (Thing OR Domain)
    # If target_canvas_id is provided, check against that canvas.
    # Otherwise check against the current canvas (local link).
    target_check_canvas_id = request.target_canvas_id or canvas_id

    target = db.query(CanvasThing).filter(
        CanvasThing.id == request.target_id,
        CanvasThing.canvas_id == target_check_canvas_id
    ).first()

    if not target:
        target = db.query(Domain).filter(
            Domain.id == request.target_id,
            Domain.canvas_id == target_check_canvas_id
        ).first()
    
    if not source:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Source (Thing/Domain) not found on this canvas"
        )

    if not target:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Target (Thing/Domain) not found on canvas {target_check_canvas_id}"
        )
    
    link = CanvasLink(
        canvas_id=canvas_id,
        source_id=request.source_id,
        target_id=request.target_id,
        type=request.type,  # Fix: request.type is a string in the schema
        label=request.label,
        description=request.description,
        source_fragment=request.source_fragment,
        target_fragment=request.target_fragment,
        target_canvas_id=request.target_canvas_id
    )
    db.add(link)
    db.commit()
    db.refresh(link)
    # Enrich response if this is a cross-canvas link
    response_link = LinkResponse.model_validate(link)
    
    if link.target_canvas_id:
        # Fetch target canvas name
        tgt_canvas = db.query(Canvas).filter(Canvas.id == link.target_canvas_id).first()
        if tgt_canvas:
            response_link.target_canvas_name = tgt_canvas.name
            
        # Fetch target object title (we already found 'target' above)
        if hasattr(target, 'title'): # CanvasThing
            response_link.target_thing_title = target.title or target.type.value
        elif hasattr(target, 'name'): # Domain
             response_link.target_thing_title = target.name

    return response_link


@router.patch(
    "/canvases/{canvas_id}/links/{link_id}",
    response_model=LinkResponse
)
def update_link(
    canvas_id: str,
    link_id: str,
    request: LinkUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Update a link's type or label."""
    canvas = _get_canvas_with_access(canvas_id, db, current_user, require_write=True)
    
    link = db.query(CanvasLink).filter(
        CanvasLink.id == link_id,
        CanvasLink.canvas_id == canvas_id
    ).first()
    
    if not link:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Link not found"
        )
    
    # Update type if provided
    if request.type is not None:
        link.type = request.type
    
    # Update label if provided (can be set to None with empty string)
    if request.label is not None:
        link.label = request.label if request.label else None

    # Update description if provided
    if request.description is not None:
        link.description = request.description
    
    # Update fragments if provided
    if request.source_fragment is not None:
        link.source_fragment = request.source_fragment
    if request.target_fragment is not None:
        link.target_fragment = request.target_fragment
    
    db.commit()
    db.refresh(link)
    return link


@router.delete("/canvases/{canvas_id}/links/{link_id}")
def delete_link(
    canvas_id: str,
    link_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Delete a link."""
    canvas = _get_canvas_with_access(canvas_id, db, current_user, require_write=True)

    link = db.query(CanvasLink).filter(
        CanvasLink.id == link_id,
        CanvasLink.canvas_id == canvas_id
    ).first()
    
    if not link:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Link not found"
        )
    
    db.delete(link)
    db.commit()
    return {"message": "Link deleted"}


# =============================================================================
# Domains CRUD
# =============================================================================

@router.post("/canvases/{canvas_id}/domains", response_model=DomainResponse)
def create_domain(
    canvas_id: str,
    request: DomainCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Create a domain container."""
    canvas = _get_canvas_with_access(canvas_id, db, current_user, require_write=True)
    
    domain = Domain(
        canvas_id=canvas_id,
        name=request.name,
        color=request.color,
        position_x=request.position.x,
        position_y=request.position.y,
        description=request.description,
        parent_id=request.parent_id if request.parent_id else None,
        # Scenario Support
        type=request.type,
        visual_config=request.visual_config,
        metadata_schema=request.metadata_schema,
        metadata_values=request.metadata_values,
        drop_zones=request.drop_zones
    )
    db.add(domain)
    db.commit()
    db.refresh(domain)
    return domain


@router.patch(
    "/canvases/{canvas_id}/domains/{domain_id}",
    response_model=DomainResponse
)
def update_domain(
    canvas_id: str,
    domain_id: str,
    request: DomainUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Update a domain."""
    canvas = _get_canvas_with_access(canvas_id, db, current_user, require_write=True)
    
    domain = db.query(Domain).filter(
        Domain.id == domain_id,
        Domain.canvas_id == canvas_id
    ).first()
    
    if not domain:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Domain not found"
        )
    
    if request.name is not None:
        domain.name = request.name
    if request.color is not None:
        domain.color = request.color
    if request.description is not None:
        domain.description = request.description
    if request.position is not None:
        domain.position_x = request.position.x
        domain.position_y = request.position.y
    if request.parent_id is not None:
        domain.parent_id = request.parent_id if request.parent_id else None
    if request.width is not None:
        domain.width = request.width
    if request.height is not None:
        domain.height = request.height
    if request.visual_config is not None:
        domain.visual_config = request.visual_config
    if request.metadata_schema is not None:
        domain.metadata_schema = request.metadata_schema
    if request.metadata_values is not None:
        domain.metadata_values = request.metadata_values
    if request.drop_zones is not None:
        domain.drop_zones = request.drop_zones
    if request.height is not None:
        domain.height = request.height
    
    db.commit()
    db.refresh(domain)
    return domain


@router.delete("/canvases/{canvas_id}/domains/{domain_id}")
def delete_domain(
    canvas_id: str,
    domain_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Delete a domain (things inside are un-grouped, not deleted)."""
    canvas = _get_canvas_with_access(canvas_id, db, current_user, require_write=True)

    domain = db.query(Domain).filter(
        Domain.id == domain_id,
        Domain.canvas_id == canvas_id
    ).first()
    
    if not domain:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Domain not found"
        )
    
    # Un-group things in this domain (don't delete them)
    db.query(CanvasThing).filter(
        CanvasThing.domain_id == domain_id
    ).update({"domain_id": None})
    
    db.delete(domain)
    db.commit()
    return {"message": "Domain deleted"}


# =============================================================================
# Summarization
# =============================================================================

@router.post(
    "/canvases/{canvas_id}/things/{thing_id}/summarize",
    response_model=SummarizeResponse
)
async def summarize_thing(
    canvas_id: str,
    thing_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Generate AI summaries for a thing at different zoom levels.
    """
    canvas = _get_canvas_with_access(canvas_id, db, current_user, require_write=True)
    
    thing = db.query(CanvasThing).filter(
        CanvasThing.id == thing_id,
        CanvasThing.canvas_id == canvas_id
    ).first()
    
    if not thing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Thing not found"
        )
    
    # Extract text content
    content_text = ""
    if thing.type == ModelThingType.TEXT:
        content_text = thing.content.get("text", "")
    elif thing.type == ModelThingType.CONVERSATION:
        messages = thing.content.get("messages", [])
        content_text = " ".join([m.get("content", "") for m in messages])
    elif thing.type == ModelThingType.DOCUMENT:
        content_text = thing.content.get("content", "")
    elif thing.type == ModelThingType.URL:
        content_text = thing.content.get("text_content", "")
    else:
        content_text = str(thing.content)

    # Use LLM service to generate summaries for all levels
    from app.services.llm_service import llm_service
    summaries = await llm_service.generate_zoom_summaries(content_text)
    
    # Store summaries
    thing.summaries = summaries
    from sqlalchemy.orm.attributes import flag_modified
    flag_modified(thing, "summaries")
    db.commit()
    
    return SummarizeResponse(
        thing_id=str(thing_id),
        summaries=summaries
    )


# =============================================================================
# Secure Query Endpoint
# =============================================================================

class QueryRequest(BaseModel):
    query: str
    k: int = 4

@router.post("/canvases/{canvas_id}/query")
def query_canvas(
    canvas_id: str,
    request: QueryRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Securely query the vector store for documents related to this canvas.
    Inherits permissions from the canvas.
    """
    # 1. Check Permissions (read access is sufficient)
    canvas = _get_canvas_with_access(canvas_id, db, current_user)
    
    if not canvas:
        # Check for Admin override if user is not found in implicit permissions
        # implicit Admin check is done via `rag_service`? No, here.
        # Check if user is admin
        is_admin = any(role.name == "Admin" for role in current_user.roles)
        if not is_admin:
             raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have access to this canvas"
            )
        # If admin, we continue even if db query above failed (wait, query failed means canvas doesn't exist OR no permission)
        # We need to verify canvas exists largely.
        canvas_exists = db.query(Canvas).filter(Canvas.id == canvas_id).first()
        if not canvas_exists:
             raise HTTPException(status_code=404, detail="Canvas not found")
        # Proceed if Admin
    
    # 2. Execute Query
    results = rag_service.search(
        query=request.query,
        filters={"canvas_id": canvas_id},
        k=request.k,
        model_name=request.model if hasattr(request, "model") else None
    )
    
    return results


# =============================================================================
# Selection Analysis (LLM Actions)
# =============================================================================

@router.post(
    "/canvases/{canvas_id}/analyze",
    response_model=AnalyzeResponse
)
async def analyze_selection(
    canvas_id: str,
    request: AnalyzeRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker("analysis:write"))
):
    """
    Analyze selected content using LLM.
    Supports summarize, explain, extract_points, and ask actions.
    Supports text and image content.
    """
    # Verify canvas access
    canvas = _get_canvas_with_access(canvas_id, db, current_user, require_write=True)
    
    if not canvas:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Canvas not found"
        )
    
    # Verify thing exists
    thing = db.query(CanvasThing).filter(
        CanvasThing.id == request.thing_id,
        CanvasThing.canvas_id == canvas_id
    ).first()
    
    if not thing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Thing not found"
        )
    
    # Get the selected content
    selected_content = request.fragment.content or ""
    
    # Check if a custom plugin is registered for this thing type
    from app.plugins.registry import PluginRegistry
    custom_analyzer = PluginRegistry.get_analyzer(thing.type.value)
    if custom_analyzer:
        print(f"[Analyze] Checking custom plugin for {thing.type.value}")
        plugin_res = await custom_analyzer(request=request, thing=thing, db=db, current_user=current_user)
        if plugin_res:
            return plugin_res
            
    # Phase 2: RAG Integration for Slideshows and Documents
    # If this is a slideshow or document and the content is large, 
    # we can fetch relevant text from the Vector Store to give the LLM context.
    if thing.type.value in ["slideshow", "document"]:
        # Check if RAG is available
        # Note: thing.rag_status is a DB Column enum (or string in some contexts?)
        # Enum comparison should work if imports are correct.
        rag_completed = thing.rag_status == RAGStatus.COMPLETED or "completed" in str(thing.rag_status).lower()
        content_missing = not selected_content or len(selected_content) < 500
        
        if rag_completed or content_missing:
             print(f"[Analyze] Detected {thing.type.value}. RAG Status: {thing.rag_status}. Fetching context...")
             
             # If action is ASK, search for the user's prompt. Otherwise summarize.
             query_text = f"Summarize this {thing.type.value}"
             if request.action == AnalyzeAction.ASK and request.custom_prompt:
                 query_text = request.custom_prompt
             
             # Retrieve top chunks from RAG
             try:
                 # Search using the query
                 # We must filter by asset_id because ingestion happens at upload time (before canvas assignment),
                 # so the vectors generally don't have canvas_id metadata yet.
                 search_filters = {}
                 asset_id = thing.content.get("asset_id")
                 if asset_id:
                     search_filters["asset_id"] = asset_id
                 else:
                     # Fallback if asset_id is missing
                     search_filters["canvas_id"] = canvas_id
 
                 active_model = _resolve_active_model(db, canvas_id, request.model)
                 
                 from app.services.llm_service import llm_service
                 # Dynamically resolve context window to avoid unneeded RAG lossiness
                 llm_obj = llm_service._get_llama_index_model(active_model)
                 context_window = getattr(llm_obj.metadata, "context_window", None) or 4096
                 safe_char_limit = (context_window - 1000) * 4
                 if safe_char_limit < 4000:
                     safe_char_limit = 12000

                 # Detect if custom prompt asks to translate or analyze the whole/entire document
                 has_entire_instruction = False
                 if request.action == AnalyzeAction.ASK and request.custom_prompt:
                     cp_lower = request.custom_prompt.lower()
                     has_entire_instruction = any(
                         word in cp_lower 
                         for word in ["translate", "entire", "whole", "full content", "complete content", "preserv"]
                     )

                 # Skip RAG if content fits in context or entire document processing is requested
                 use_rag = True
                 if thing.type.value == "document":
                     # If selected_content is very short (e.g. < 500 chars), it's likely just a title fallback from the frontend.
                     # In that case, we MUST use RAG to get the actual text.
                     if selected_content and len(selected_content) > 500 and (len(selected_content) < safe_char_limit or has_entire_instruction):
                         if len(selected_content) < safe_char_limit:
                             use_rag = False
                             print(f"[Analyze] Document is small enough ({len(selected_content)} chars < {safe_char_limit} limit), skipping RAG.")
                         elif has_entire_instruction and len(selected_content) < safe_char_limit * 1.5:
                             use_rag = False
                             print(f"[Analyze] Custom prompt instructs to process entire document, skipping RAG (len={len(selected_content)}).")

                 if use_rag:
                     # Standard Top-K Flow
                     print(f"[Analyze RAG] Frontend provided short text (Length: {len(selected_content)} chars). Engaging LlamaIndex RAG to retrieve full context from vector database...")
                     
                     fetch_k = 40 if has_entire_instruction else 5
                     
                     import asyncio
                     print(f"[Analyze RAG] Starting background thread for rag_service.search... (k={fetch_k})")
                     start_time = asyncio.get_event_loop().time()
                     results = await asyncio.to_thread(
                         rag_service.search,
                         query=query_text, 
                         k=fetch_k, 
                         filters=search_filters, 
                         model_name=active_model
                     )
                     elapsed = asyncio.get_event_loop().time() - start_time
                     print(f"[Analyze RAG] Background thread finished in {elapsed:.2f}s. Results: {len(results) if results else 0}")
                     
                     if results:
                         # Join chunks to form context
                         context_texts = [r['text'] for r in results]
                         
                         if thing.type.value == "slideshow":
                             # PREPEND SYSTEM INSTRUCTION FOR SPATIAL AWARENESS
                             system_note = (
                                "SYSTEM NOTE: The following context describes slides with spatial coordinates (x,y,w,h normalized 0.0-1.0) "
                                "and visual attributes (Shape Type, Colors). "
                                "Use this to mentally reconstruct the visual layout and hierarchy. "
                                "Coordinates: x=0 (left), y=0 (top). "
                                "Visuals are described as [TYPE] (Layout...) (Color...) \"Text\"."
                             )
                             selected_content = f"{system_note}\n\nRelevant Slides/Context:\n" + "\n---\n".join(context_texts)
                         else:
                             selected_content = "Relevant Document Context:\n" + "\n---\n".join(context_texts)
                             
                         print(f"[Analyze] Retrieved {len(results)} chunks from RAG for context.")
                     else:
                         if thing.type.value == "slideshow" or not selected_content:
                             selected_content = "No relevant context found in RAG index for this query."
                         else:
                             print("[Analyze] RAG returned nothing, falling back to raw text content.")
             except Exception as e:
                 print(f"[Analyze] RAG Search failed: {e}")
                 import traceback
                 traceback.print_exc()
                 # Fallback to existing content (metadata)
                 selected_content = f"RAG Search failed: {e}"

    if not selected_content:
        # Fallback for Region fragments (if cropping failed or wasn't provided)
        if request.fragment.type == "region":
            print("[Analyze] Warning: No content provided for region. Using coordinate fallback.")
            selected_content = (
                f"[Selected Region]\n"
                f"Coordinates: x={request.fragment.x:.2f}, y={request.fragment.y:.2f}, "
                f"w={request.fragment.width:.2f}, h={request.fragment.height:.2f}\n"
                "(Visual analysis unavailable due to missing image data)"
            )
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No content selected for analysis"
            )
    
    # Build prompt based on action
    # If content looks like base64 or is very long, don't put it all in the text prompt
    content_for_prompt = selected_content
    # Only truncate if it looks like a raw image data URL
    if "base64" in str(selected_content).lower() and len(selected_content) > 1000:
         content_for_prompt = "[Image Content (Base64 Truncated)]"

    if request.action == AnalyzeAction.SUMMARIZE:
        system_prompt = "You are a helpful assistant. Provide concise, clear summaries."
        user_prompt = prompt_service.get_prompt(
            SUMMARIZE_PROMPT.key,
            variables={"content": content_for_prompt},
            user_id=current_user.id
        )
    elif request.action == AnalyzeAction.EXPLAIN:
        system_prompt = "You are a helpful assistant. Explain concepts clearly and simply."
        user_prompt = prompt_service.get_prompt(
            EXPLAIN_PROMPT.key,
            variables={"content": content_for_prompt},
            user_id=current_user.id
        )
    elif request.action == AnalyzeAction.EXTRACT_POINTS:
        system_prompt = "You are a helpful assistant. Extract key information as bullet points."
        user_prompt = f"Please extract the key points from the following content as a bullet list:\n\n{content_for_prompt}"
    elif request.action == AnalyzeAction.ASK:
        if not request.custom_prompt:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Custom prompt required for 'ask' action"
            )
        
        # Route custom instructions/personas to system prompt, otherwise standard Q&A
        cp_lower = request.custom_prompt.lower()
        looks_like_instruction = (
            len(request.custom_prompt) > 100 
            or "\n" in request.custom_prompt
            or any(p in cp_lower for p in ["you act as", "you are", "objective:", "constraints:", "formatting rules:"])
        )
        if looks_like_instruction:
            system_prompt = request.custom_prompt
            user_prompt = content_for_prompt
        else:
            system_prompt = "You are a helpful assistant. Answer questions based on the provided context."
            user_prompt = f"{request.custom_prompt}\n\nContext:\n{content_for_prompt}"
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unknown action: {request.action}"
        )
    
    # Call LLM service or Vision Service
    from app.services.llm_service import llm_service
    from app.models.chat import Message
    from app.services.vision_service import vision_service

    active_model = _resolve_active_model(db, canvas_id, request.model)

    try:
        # Check for image data
        image_payload = request.image_data
        # If fragment is region and has content (base64), use that
        if not image_payload and request.fragment.content:
            # Check if content is base64
            content_str = str(request.fragment.content)
            if "base64," in content_str[:100] or (len(content_str) > 5000 and not " " in content_str[:100]):
                 # Assume it's an image if it has base64 header or is a long string without spaces (raw base64)
                 # EXCEPTION: If it starts with '{' or '[', it is likely JSON metadata, not image
                 if not content_str.strip().startswith("{") and not content_str.strip().startswith("["):
                     image_payload = request.fragment.content
                     print(f"[Analyze] Detected base64 content in fragment type '{request.fragment.type}'")
                 else:
                     print(f"[Analyze] Ignoring JSON-like content from image detection (len={len(content_str)})")

        if image_payload:
            # Vision capabilities
            print(f"[Analyze] Processing image analysis with model {model_name}")
            
            # Special prompt engineering for diagrams if "Explain" is requested
            final_system_prompt = system_prompt
            final_user_prompt = user_prompt
            
            if request.action == AnalyzeAction.EXPLAIN:
                final_system_prompt = (
                    "You are an expert technical analyst. "
                    "Analyze the structural relationships, components, and data flow in this diagram. "
                    "Be precise and structured."
                )
                final_user_prompt = (
                    f"Please explain the diagram structure and components based on this selection.\n\n"
                    f"{user_prompt}" 
                )
            elif request.action == AnalyzeAction.ASK and request.custom_prompt:
                final_user_prompt = request.custom_prompt

            if request.action == AnalyzeAction.SUMMARIZE:
                 final_user_prompt = "Summarize the visual content of this image."

            response = await vision_service.analyze(
                image_data=image_payload,
                prompt=final_user_prompt,
                system_prompt=final_system_prompt,
                model_name=active_model
            )
        else:
            # Standard Text LLM
            # Debug Logging
            print("\nXXX DEBUG PROMPT XXX")
            print(f"System Prompt: {system_prompt}")
            print(f"User Prompt (len={len(user_prompt)}): {user_prompt[:1000]}... [may be truncated]")
            print("XXX DEBUG PROMPT END XXX\n")

            # MAGIC COMMAND FOR DEBUGGING
            if request.action == AnalyzeAction.ASK and request.custom_prompt == "DEBUG_PROMPT":
                 return AnalyzeResponse(
                    thing_id=request.thing_id,
                    action=request.action,
                    result=f"--- SYSTEM PROMPT ---\n{system_prompt}\n\n--- USER PROMPT ---\n{user_prompt}",
                    created_thing_id=None 
                )

            from app.models.chat import Message
            
            # Intelligent prompt truncation to prevent vLLM 400 Bad Request errors
            llm_obj = llm_service._get_llama_index_model(active_model)
            safe_window = (llm_obj.metadata.context_window or 4096) - 1000
            max_chars = safe_window * 4
            if len(user_prompt) > max_chars:
                print(f"[Analyze] Truncating user prompt from {len(user_prompt)} to {max_chars} chars to fit in {safe_window} tokens.")
                user_prompt = user_prompt[:max_chars] + "\n\n...[CONTENT TRUNCATED TO FIT MODEL CONTEXT WINDOW]"
            
            response = await llm_service.chat(
                messages=[
                    Message(role="system", content=system_prompt),
                    Message(role="user", content=user_prompt)
                ],
                model_name=active_model
            )
            print(f"[Analyze] LLM Response received (len={len(response)})")
        
        return AnalyzeResponse(
            thing_id=request.thing_id,
            action=request.action,
            result=response,
            created_thing_id=None
        )
    except Exception as e:
        debug_service.log("ERROR", "Smart Analysis", "Analysis", f"Error in analyze_selection: {str(e)}", {"thing_id": request.thing_id, "action": request.action})
        raise HTTPException(status_code=500, detail=str(e))



@router.post(
    "/canvases/{canvas_id}/analyze/stream",
)
async def analyze_selection_stream(
    canvas_id: str,
    request: AnalyzeRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker("analysis:write"))
):
    """
    Analyze selected content using LLM with real-time streaming to avoid timeouts.
    Supports summarize, explain, extract_points, and ask actions.
    """
    # 1. Verify canvas access
    canvas = _get_canvas_with_access(canvas_id, db, current_user, require_write=True)
    if not canvas:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Canvas not found"
        )
    
    # 2. Verify thing exists
    thing = db.query(CanvasThing).filter(
        CanvasThing.id == request.thing_id,
        CanvasThing.canvas_id == canvas_id
    ).first()
    if not thing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Thing not found"
        )
    
    # 3. Get the selected content
    selected_content = request.fragment.content or ""
    
    # RAG integration (identical to sync analyze_selection)
    if thing.type.value in ["slideshow", "document"]:
        if thing.rag_status == RAGStatus.COMPLETED or str(thing.rag_status) == "completed":
             print(f"[Analyze Stream] Detected {thing.type.value} with RAG. Fetching context...")
             query_text = f"Summarize this {thing.type.value}"
             if request.action == AnalyzeAction.ASK and request.custom_prompt:
                 query_text = request.custom_prompt
             
             try:
                 search_filters = {}
                 asset_id = thing.content.get("asset_id")
                 if asset_id:
                     search_filters["asset_id"] = asset_id
                 else:
                     search_filters["canvas_id"] = canvas_id
 
                 active_model = _resolve_active_model(db, canvas_id, request.model)
                 
                 # Dynamically resolve context window to avoid unneeded RAG lossiness
                 llm_obj = llm_service._get_llama_index_model(active_model)
                 context_window = getattr(llm_obj.metadata, "context_window", None) or 4096
                 safe_char_limit = (context_window - 1000) * 4
                 if safe_char_limit < 4000:
                     safe_char_limit = 12000

                 # Detect if custom prompt asks to translate or analyze the whole/entire document
                 has_entire_instruction = False
                 if request.action == AnalyzeAction.ASK and request.custom_prompt:
                     cp_lower = request.custom_prompt.lower()
                     has_entire_instruction = any(
                         word in cp_lower 
                         for word in ["translate", "entire", "whole", "full content", "complete content", "preserv"]
                     )

                 # Skip RAG if content fits in context or entire document processing is requested
                 use_rag = True
                 if thing.type.value == "document":
                     if selected_content and (len(selected_content) < safe_char_limit or has_entire_instruction):
                         if len(selected_content) < safe_char_limit:
                             use_rag = False
                             print(f"[Analyze Stream] Document is small enough ({len(selected_content)} chars < {safe_char_limit} limit), skipping RAG.")
                         elif has_entire_instruction and len(selected_content) < safe_char_limit * 1.5:
                             use_rag = False
                             print(f"[Analyze Stream] Custom prompt instructs to process entire document, skipping RAG (len={len(selected_content)}).")

                 if use_rag:
                     results = rag_service.search(query=query_text, k=5, filters=search_filters, model_name=active_model)
                     if results:
                         context_texts = [r['text'] for r in results]
                         if thing.type.value == "slideshow":
                             system_note = (
                                "SYSTEM NOTE: The following context describes slides with spatial coordinates (x,y,w,h normalized 0.0-1.0) "
                                "and visual attributes (Shape Type, Colors). "
                                "Use this to mentally reconstruct the visual layout and hierarchy. "
                                "Coordinates: x=0 (left), y=0 (top). "
                                "Visuals are described as [TYPE] (Layout...) (Color...) \"Text\"."
                             )
                             selected_content = f"{system_note}\n\nRelevant Slides/Context:\n" + "\n---\n".join(context_texts)
                         else:
                             selected_content = "Relevant Document Context:\n" + "\n---\n".join(context_texts)
                             
                         print(f"[Analyze Stream] Retrieved {len(results)} chunks from RAG for context.")
                     else:
                         if thing.type.value == "slideshow" or not selected_content:
                             selected_content = "No relevant context found in RAG index for this query."
                         else:
                             print("[Analyze Stream] RAG returned nothing, falling back to raw text content.")
             except Exception as e:
                 print(f"[Analyze Stream] RAG Search failed: {e}")

    if not selected_content:
        if request.fragment.type == "region":
            selected_content = (
                f"[Selected Region]\n"
                f"Coordinates: x={request.fragment.x:.2f}, y={request.fragment.y:.2f}, "
                f"w={request.fragment.width:.2f}, h={request.fragment.height:.2f}\n"
                "(Visual analysis unavailable due to missing image data)"
            )
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No content selected for analysis"
            )
    
    content_for_prompt = selected_content
    if "base64" in str(selected_content).lower() and len(selected_content) > 1000:
         content_for_prompt = "[Image Content (Base64 Truncated)]"

    # Build prompt based on action
    if request.action == AnalyzeAction.SUMMARIZE:
        system_prompt = "You are a helpful assistant. Provide concise, clear summaries."
        user_prompt = prompt_service.get_prompt(
            SUMMARIZE_PROMPT.key,
            variables={"content": content_for_prompt},
            user_id=current_user.id
        )
    elif request.action == AnalyzeAction.EXPLAIN:
        system_prompt = "You are a helpful assistant. Explain concepts clearly and simply."
        user_prompt = prompt_service.get_prompt(
            EXPLAIN_PROMPT.key,
            variables={"content": content_for_prompt},
            user_id=current_user.id
        )
    elif request.action == AnalyzeAction.EXTRACT_POINTS:
        system_prompt = "You are a helpful assistant. Extract key information as bullet points."
        user_prompt = f"Please extract the key points from the following content as a bullet list:\n\n{content_for_prompt}"
    elif request.action == AnalyzeAction.ASK:
        if not request.custom_prompt:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Custom prompt required for 'ask' action"
            )
        
        # Route custom instructions/personas to system prompt, otherwise standard Q&A
        cp_lower = request.custom_prompt.lower()
        looks_like_instruction = (
            len(request.custom_prompt) > 100 
            or "\n" in request.custom_prompt
            or any(p in cp_lower for p in ["you act as", "you are", "objective:", "constraints:", "formatting rules:"])
        )
        if looks_like_instruction:
            system_prompt = request.custom_prompt
            user_prompt = content_for_prompt
        else:
            system_prompt = "You are a helpful assistant. Answer questions based on the provided context."
            user_prompt = f"{request.custom_prompt}\n\nContext:\n{content_for_prompt}"
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unknown action: {request.action}"
        )
    
    from app.services.llm_service import llm_service
    from app.models.chat import Message
    from app.services.vision_service import vision_service
    import json

    active_model = _resolve_active_model(db, canvas_id, request.model)
    image_payload = request.image_data
    if not image_payload and request.fragment.content:
        content_str = str(request.fragment.content)
        if "base64," in content_str[:100] or (len(content_str) > 5000 and not " " in content_str[:100]):
            if not content_str.strip().startswith("{") and not content_str.strip().startswith("["):
                image_payload = request.fragment.content

    async def stream_generator():
        try:
            if image_payload:
                print(f"[Analyze Stream] Processing visual analysis for {thing.id}")
                final_system_prompt = system_prompt
                final_user_prompt = user_prompt
                if request.action == AnalyzeAction.EXPLAIN:
                    final_system_prompt = "You are an expert technical analyst. Analyze structural relationships."
                    final_user_prompt = f"Please explain the diagram structure based on this selection.\n\n{user_prompt}"
                elif request.action == AnalyzeAction.ASK and request.custom_prompt:
                    final_user_prompt = request.custom_prompt
                elif request.action == AnalyzeAction.SUMMARIZE:
                     final_user_prompt = "Summarize the visual content of this image."

                response = await vision_service.analyze(
                    image_data=image_payload,
                    prompt=final_user_prompt,
                    system_prompt=final_system_prompt,
                    model_name=active_model
                )
                yield json.dumps({"type": "chunk", "content": response}) + "\n"
                yield json.dumps({"type": "complete", "result": response}) + "\n"
            else:
                # Text LLM streaming
                llm_obj = llm_service._get_llama_index_model(active_model)
                safe_window = (llm_obj.metadata.context_window or 4096) - 1000
                max_chars = safe_window * 4
                truncated_prompt = user_prompt
                if len(truncated_prompt) > max_chars:
                    truncated_prompt = truncated_prompt[:max_chars] + "\n\n...[CONTENT TRUNCATED]"

                full_response = ""
                async for chunk in llm_service.astream_chat(
                    messages=[
                        Message(role="system", content=system_prompt),
                        Message(role="user", content=truncated_prompt)
                    ],
                    model_name=active_model
                ):
                    full_response += chunk
                    yield json.dumps({"type": "chunk", "content": chunk}) + "\n"
                
                yield json.dumps({"type": "complete", "result": full_response}) + "\n"
        except Exception as ex:
            print(f"[Analyze Stream] Streaming exception: {ex}")
            yield json.dumps({"type": "error", "content": str(ex)}) + "\n"

    return StreamingResponse(stream_generator(), media_type="application/x-ndjson")


@router.post(
    "/canvases/{canvas_id}/analyze-batch",

    response_model=AnalyzeResponse
)
async def analyze_batch(
    canvas_id: str,
    request: BatchAnalyzeRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Analyze multiple things at once (e.g. Summarize, Identify Purpose).
    Aggregates content and sends a single prompt to LLM.
    """
    # 1. Verify canvas access
    canvas = _get_canvas_with_access(canvas_id, db, current_user, require_write=True)
    
    if not canvas:
        raise HTTPException(status_code=404, detail="Canvas not found")

    # 2. Fetch all things
    things = db.query(CanvasThing).filter(
        CanvasThing.id.in_(request.thing_ids),
        CanvasThing.canvas_id == canvas_id
    ).all()
    
    if not things:
        raise HTTPException(status_code=404, detail="No valid things found to analyze")

    # 3. Aggregate Content
    aggregated_text = ""
    for thing in things:
        content_text = ""
        # Extract text based on type
        if thing.type.value == "text":
            content_text = thing.content.get("text", "")
        elif thing.type.value == "document":
            content_text = thing.content.get("text_content") or thing.content.get("content", "")
            if not content_text and thing.content.get("summary"):
                 content_text = f"Summary: {thing.content.get('summary')}"
        elif thing.type.value == "url":
             content_text = f"URL: {thing.content.get('url')} - {thing.content.get('title', '')}"
        elif thing.type.value == "message":
             content_text = thing.content.get("content", "")
        elif thing.type.value == "table":
             # Tables usually store data in 'data' key or 'csv'
             import json
             data = thing.content.get("data")
             if data:
                 content_text = f"Table Data: {json.dumps(data)}"
        elif thing.type.value == "image":
             # For images, we can't do full VLM batching yet easily, check for captions/descriptions
             desc = thing.content.get("description") or thing.content.get("caption") or thing.content.get("extracted_text")
             if desc:
                 content_text = f"Image Description/Text: {desc}"
             else:
                 content_text = f"Image (No text description available). Title: {thing.content.get('title', 'Untitled')}"
        else:
             # Fallback: Try to dump content
             try:
                 import json
                 content_text = f"Item Data: {json.dumps(thing.content)}"
             except:
                 content_text = str(thing.content)
        
        if content_text:
            aggregated_text += f"\n--- Item: {thing.type.value} ---\n{content_text[:4000]}\n" # Limit per item context

    if not aggregated_text.strip():
        raise HTTPException(status_code=400, detail="Selected items contain no analyzable text.")

    # 4. Construct Prompt based on Action
    system_prompt = "You are an expert analyst assistant."
    user_prompt = ""

    if request.action == AnalyzeAction.SUMMARIZE or request.action.value == "summarize":
        user_prompt = (
            f"Please provide a comprehensive summary of the following collection of items.\n"
            f"Identify common themes, contradictions, and key takeaways.\n\n"
            f"Content:\n{aggregated_text}"
        )
    elif request.action == AnalyzeAction.IDENTIFY_PURPOSE or request.action.value == "identify_purpose":
        user_prompt = (
            f"Analyze the following items and identify the underlying shared purpose or goal.\n"
            f"Why were these items grouped together? What problem are they trying to solve?\n\n"
            f"Content:\n{aggregated_text}"
        )
    else:
        # Generic
        user_prompt = f"Analyze the following content:\n{aggregated_text}"

    # 5. Call LLM
    try:
        active_model = _resolve_active_model(db, canvas_id, request.model)
        response_text = await llm_service.chat(
            messages=[
                Message(role="system", content=system_prompt),
                Message(role="user", content=user_prompt)
            ],
            model_name=active_model
        )
        
        return AnalyzeResponse(
            thing_id="batch_result",
            action=request.action,
            result=response_text,
            created_thing_id=None
        )

    except Exception as e:
        print(f"Batch Analysis Failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

    except Exception as e:
        print(f"[Analyze] Error: {e}")
        return AnalyzeResponse(
            thing_id=request.thing_id,
            action=request.action,
            result=f"Error analyzing content: {str(e)}",
            created_thing_id=None
        )
# =============================================================================
# Discover Links (Semantic Analysis)
# =============================================================================

@router.post(
    "/canvases/{canvas_id}/discover-links",
    response_model=DiscoverLinksResponse
)
async def discover_links(
    canvas_id: str,
    request: DiscoverLinksRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Analyze selected items (Things & Domains) to discover and create semantic links.
    """
    from app.schemas.canvas_schemas import DiscoverLinksResponse, DiscoveredLinkDetail
    import json

    # 0. Resolve Model
    active_model = _resolve_active_model(db, canvas_id, request.model)

    debug_service.log("INFO", "Smart Analysis", "DiscoverLinks", f"Starting discovery for Canvas {canvas_id}", {
        "thing_ids": request.thing_ids,
        "domain_ids": request.domain_ids,
        "model": active_model
    })

    try:
        # 1. Verify Canvas Access
        canvas = db.query(Canvas).filter(
            Canvas.id == canvas_id,
            Canvas.owner_id == current_user.id
        ).first()
        
        if not canvas:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Canvas not found"
            )
        # 2. Collect Entities
        things_map = {}
        domains_map = {}
        
        # Fetch Things
        if request.thing_ids:
            things = db.query(CanvasThing).filter(
                CanvasThing.id.in_(request.thing_ids),
                CanvasThing.canvas_id == canvas_id
            ).all()
            
            for thing in things:
                # Determine summary
                summary = ""
                # Priority: Generated Summary > Description > Raw Text Content
                content = thing.content or {}
                
                if content.get("generated_description"):
                    summary = content["generated_description"]
                elif content.get("description"):
                    summary = content["description"]
                elif thing.type == ModelThingType.TEXT:
                    summary = content.get("text", "")[:500] # Truncate raw text
                elif thing.type == ModelThingType.DOCUMENT:
                    summary = f"Document: {content.get('filename', 'Unknown')}"
                    debug_service.log("DEBUG", "Smart Analysis", "DiscoverLinks", f"Checking RAG status for {thing.id}: {thing.rag_status}")
                    
                    if thing.rag_status and thing.rag_status.lower() == "completed":
                        try:
                            from app.services.rag_service import rag_service
                            # Correct filter is 'thing_id' as set in canvas_worker.py
                            filters = {"thing_id": thing.id}
                            
                            debug_service.log("DEBUG", "Smart Analysis", "DiscoverLinks", f"Fetching RAG context for {thing.id} with filters {filters}...")
                            
                            results = rag_service.search(
                                query="Summary and key themes of this document",
                                filters=filters,
                                k=3,
                                model_name=active_model
                            )
                            
                            if not results:
                                 # Fallback: Try searching by filename if thing_id didn't work (unlikely if status is completed)
                                filename = content.get("filename")
                                if filename:
                                    debug_service.log("WARN", "Smart Analysis", "DiscoverLinks", f"No results for thing_id {thing.id}, trying filename {filename}")
                                    # SimpleDirectoryReader often adds 'file_name' to metadata
                                    results = rag_service.search(
                                        query="Summary and key themes of this document",
                                        filters={"file_name": filename},
                                        k=3,
                                        model_name=active_model
                                    )

                            if results:
                                debug_service.log("INFO", "Smart Analysis", "DiscoverLinks", f"Found {len(results)} RAG chunks for {thing.id}")
                                rag_context = "\n".join([r["text"] for r in results])
                                summary += f"\n\nContext:\n{rag_context}"
                            else:
                                debug_service.log("WARN", "Smart Analysis", "DiscoverLinks", f"No RAG results found for {thing.id} after fallback.")
                                
                        except Exception as e:
                            debug_service.log("ERROR", "Smart Analysis", "DiscoverLinks", f"Failed to fetch RAG context for thing {thing.id}: {e}")
                    else:
                        debug_service.log("WARN", "Smart Analysis", "DiscoverLinks", f"Skipping RAG for {thing.id} - status is {thing.rag_status}")
                elif thing.type == ModelThingType.IMAGE:
                    summary = "Image"
                    if thing.rag_status and thing.rag_status.lower() == "completed":
                        try:
                            from app.services.rag_service import rag_service
                            filters = {"thing_id": thing.id}
                            debug_service.log("DEBUG", "Smart Analysis", "DiscoverLinks", f"Fetching RAG context for IMAGE {thing.id}...")
                            
                            results = rag_service.search(
                                query="Describe this image",
                                filters=filters,
                                k=3,
                                model_name=active_model
                            )
                            
                            if results:
                                debug_service.log("INFO", "Smart Analysis", "DiscoverLinks", f"Found {len(results)} chunks for IMAGE {thing.id}")
                                rag_context = "\n".join([r["text"] for r in results])
                                summary += f"\n\nVisual Analysis:\n{rag_context}"
                            else:
                                summary += " (No description available)"
                        except Exception as e:
                            debug_service.log("ERROR", "Smart Analysis", "DiscoverLinks", f"Failed to fetch RAG for image {thing.id}: {e}")
                            summary += " (Error fetching description)"
                    else:
                        summary += " (Not analyzed)"
                
                things_map[thing.id] = {
                    "title": thing.title or f"{thing.type.value} {thing.id[:4]}",
                    "summary": summary,
                    "type": thing.type.value
                }

        # Fetch Domains
        if request.domain_ids:
            domains = db.query(Domain).filter(
                Domain.id.in_(request.domain_ids),
                Domain.canvas_id == canvas_id
            ).all()
            
            for domain in domains:
                # Domain Summary Logic:
                # Use description if available, otherwise synthesize from contents
                
                desc = domain.description or ""
                
                if not desc:
                    # Find things inside this domain (even if not selected)
                    internal_things = db.query(CanvasThing).filter(
                        CanvasThing.domain_id == domain.id
                    ).limit(5).all()
                    
                    titles = [t.title or t.type.value for t in internal_things]
                    if titles:
                        desc = f"Contains: {', '.join(titles)}"
                
                domains_map[domain.id] = {
                    "name": domain.name,
                    "description": desc
                }
        
        debug_service.log("INFO", "Smart Analysis", "DiscoverLinks", f"Entities collected: {len(things_map)} Things, {len(domains_map)} Domains", {
            "things": {k: {**v, "summary": (v["summary"][:100] + "...") if len(v["summary"]) > 100 else v["summary"]} for k,v in things_map.items()},
            "domains": domains_map
        })

        if not things_map and not domains_map:
            return DiscoverLinksResponse(links_created=0, domains_updated=0, details=[])

        # 3. Construct Prompt
        system_prompt = """
        You are an expert Semantic Analyst and Knowledge Graph Architect.
        Your goal is to analyze the provided entities (Things and Domains) and discover deep, meaningful, and specific semantic connections between them.

        You must output a JSON object with a list of "links".

        ### valid Link Types (in order of preference):
        1. proves / refutes (Logical or evidential connection)
        2. triggers / blocks (Causal or process connection)
        3. prerequisites / supersedes (Temporal or dependency connection)
        4. influences (Soft causal connection)
        5. derived_from (Source origin)
        6. contains (Logical containment)
        7. references (Explicit citation - use sparingly)
        8. related (General connection - AVOID unless necessary)

        ### Valid Output Format:
        {
            "links": [
                {
                    "source_id": "UUID",
                    "target_id": "UUID",
                    "type": "one of the types above",
                    "label": "Specific, causal, or evidence-based relationship phrase (e.g., 'provides statistical evidence for', 'defines the protocol for')",
                    "description": "Extensive explanation (2-3 sentences) citing specific details from the content that justify this link."
                }
            ]
        }

        ### Rules for High-Quality Links:
        1. **BE SPECIFIC**: Never use generic labels like "references" or "relates to". 
           - BAD: Label="references"
           - GOOD: Label="provides statistical evidence for"
           - GOOD: Label="defines the protocol used in"
        2. **EXTENSIVE DESCRIPTION**: The description must explain *exactly* why these two things are linked, citing content from both.
        3. **PREFER CAUSALITY**: If A causes B, or A is needed for B, use `triggers`, `influences`, or `prerequisites`.
        4. **AVOID OBVIOUS**: Do not link things just because they are in the same domain. Link them only if their *content* interacts.
        5. **DIRECTION MATTERS**: Ensure source->target direction makes logical sense for the chosen type (e.g. Evidence -> Hypothesis = PROVES).
        6. **MULTIPLE LINKS**: It is acceptable to create multiple links between the same two entities IF they represent distinct relationships.
        
        Return ONLY the JSON. Do not include markdown formatting like ```json.
        If you find NO meaningful links, you MUST return {"links": []} instead of an empty object {}.
        """
        
        user_prompt = f"""
        Analyze the following entities and their content to find semantic connections.
        
        ### Input Entities
        
        Things:
        {json.dumps(things_map, indent=2)}
        
        Domains:
        {json.dumps(domains_map, indent=2)}
        
        ### Instructions
        Analyze the "summary" and "context" of each entity. 
        Look for concepts, data points, or themes that bridge these entities.
        Generate the JSON output.
        """
        
        # Log the prompt for debugging
        debug_service.log("DEBUG", "Smart Analysis", "DiscoverLinks", "Prompt Constructed", {
            "system_prompt": system_prompt,
            "user_prompt_preview": user_prompt[:1000] + "..." if len(user_prompt) > 1000 else user_prompt
        })


        # 4. Call LLM (using resolved active_model)
        from app.models.chat import Message
        response_text = await llm_service.chat(
            messages=[
                Message(role="system", content=system_prompt),
                Message(role="user", content=user_prompt)
            ],
            model_name=active_model
        )
        
        debug_service.log("DEBUG", "Smart Analysis", "DiscoverLinks", "LLM Response Received", {"response": response_text})

        
        # Parse JSON
        import json
        try:
            # Handle potential markdown wrapping using LLM service's robust extractor
            cleaned_text = llm_service._extract_json(response_text)
            result_json = json.loads(cleaned_text)
            links_data = result_json.get("links", [])
        except Exception as je:
            debug_service.log("ERROR", "Smart Analysis", "DiscoverLinks", "Failed to parse JSON response", {"response_text": response_text, "error": str(je)})
            return DiscoverLinksResponse(links_created=0, domains_updated=0, details=[])


        # 5. Create Links
        created_links = []
        created_count = 0
        
        existing_links = db.query(CanvasLink).filter(
            CanvasLink.canvas_id == canvas_id
        ).all()
        
        # Determine existing keys by (source, target, type) to allow multiple types between same nodes
        existing_keys = set((l.source_id, l.target_id, l.type) for l in existing_links)
        
        for link_data in links_data:
            source = link_data.get("source_id")
            target = link_data.get("target_id")
            l_type_val = link_data.get("type")
            l_type = (l_type_val if l_type_val else "related").lower()
            label = link_data.get("label") or ""
            
            # Validate IDs exist in our scope
            valid_ids = set(things_map.keys()) | set(domains_map.keys())
            if source not in valid_ids or target not in valid_ids:
                continue
                
            if source == target:
                continue
            
            # Map loose types to Enum if possible, else fallback 'related'
            try:
                model_type = ModelLinkType(l_type)
            except ValueError:
                model_type = ModelLinkType.RELATED
                
            # Check for duplicate link (same source, target, and type)
            if (source, target, model_type) in existing_keys:
                continue
                
            description = link_data.get("description") or link_data.get("rationale", "")

            # Create Link
            new_link = CanvasLink(
                canvas_id=canvas_id,
                source_id=source,
                target_id=target,
                type=model_type,
                label=label or None,
                description=description or None
            )
            db.add(new_link)
            created_count += 1
            existing_keys.add((source, target, model_type))
            
            created_links.append(DiscoveredLinkDetail(
                source_id=source,
                target_id=target,
                type=model_type.value,
                label=label or "Related",  # Fallback needed as schema requires str
                description=description
            ))
            
        db.commit()
        
        debug_service.log("INFO", "Smart Analysis", "DiscoverLinks", f"Discovery complete. Created {created_count} new links.")
        
        return DiscoverLinksResponse(
            links_created=created_count,
            domains_updated=0,
            details=created_links
        )

    except Exception as e:
        error_detail = f"Discover Links Failed: {str(e)}"
        try:
            # Try to log detailed debug info
            import traceback
            tb = traceback.format_exc()
            debug_service.log("ERROR", "Smart Analysis", "DiscoverLinks", error_detail, {"traceback": tb})
            print(f"[DiscoverLinks Error] {error_detail}\n{tb}")
        except Exception as log_err:
            # Fallback if logging fails
            print(f"[DiscoverLinks Critical] Could not log error: {log_err}")
            print(f"[DiscoverLinks Original Error] {error_detail}")

        # Always return the error to the client
        raise HTTPException(status_code=500, detail=error_detail)


@router.post("/canvases/{canvas_id}/execute-template", response_model=ExecuteTemplateResponse)
async def execute_template_endpoint(
    canvas_id: str,
    request: ExecuteTemplateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Execute a smart analysis template on the canvas."""
    # Ensure request canvas_id matches path
    request.canvas_id = canvas_id 
    
    # Check Permissions
    user_role_ids = [role.id for role in current_user.roles]
    canvas = db.query(Canvas).filter(
        Canvas.id == canvas_id,
        or_(
            Canvas.owner_id == current_user.id,
            Canvas.allowed_users.any(id=current_user.id),
            Canvas.allowed_roles.any(Role.id.in_(user_role_ids))
        )
    ).first()
    
    if not canvas:
         raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Canvas not found"
        )

    # Resolve active model
    request.model = _resolve_active_model(db, canvas_id, request.model)

    try:
        return await smart_template_service.execute_template(db, request)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        print(f"[ExecuteTemplate] Error: {e}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/canvases/{canvas_id}/execute-template/stream")
async def execute_template_stream_endpoint(
    canvas_id: str,
    request: ExecuteTemplateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Execute a smart analysis template with streaming progress updates."""
    # Ensure request canvas_id matches path
    request.canvas_id = canvas_id 
    
    # Check Permissions
    user_role_ids = [role.id for role in current_user.roles]
    canvas = db.query(Canvas).filter(
        Canvas.id == canvas_id,
        or_(
            Canvas.owner_id == current_user.id,
            Canvas.allowed_users.any(id=current_user.id),
            Canvas.allowed_roles.any(Role.id.in_(user_role_ids))
        )
    ).first()
    
    if not canvas:
         raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Canvas not found"
        )

    import json
    from datetime import datetime
    
    class SafeJSONEncoder(json.JSONEncoder):
        def default(self, obj):
            if isinstance(obj, datetime):
                return obj.isoformat()
            if hasattr(obj, '__dict__'):
                return str(obj)
            try:
                return super().default(obj)
            except TypeError:
                return str(obj)

    # Resolve active model
    request.model = _resolve_active_model(db, canvas_id, request.model)

    async def event_generator():
        try:
            print(f"[Stream] Starting template execution for {request.template_id}")
            print(f"[Stream] Request thing_ids: {request.thing_ids}, canvas_id: {request.canvas_id}")
            async for event in smart_template_service.execute_template_stream(db, request):
                yield json.dumps(event, cls=SafeJSONEncoder) + "\n"
        except Exception as e:
            print(f"[Stream] Error: {e}")
            traceback.print_exc()
            yield json.dumps({"type": "error", "content": str(e)}, cls=SafeJSONEncoder) + "\n"
            
    return StreamingResponse(event_generator(), media_type="application/x-ndjson")


@router.post("/canvases/{canvas_id}/bulk-delete")
async def bulk_delete_items(
    canvas_id: str,
    request: BatchDeleteRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Bulk delete things and domains from a canvas.
    """
    from app.schemas.canvas_schemas import BatchDeleteRequest
    
    # 1. Verify Canvas Access
    canvas = _get_canvas_with_access(canvas_id, db, current_user, require_write=True)
    
    if not canvas:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Canvas not found"
        )
    
    deleted_things_count = 0
    deleted_domains_count = 0
    
    try:
        # 2. Delete Things
        if request.thing_ids:
            things_to_delete = db.query(CanvasThing).filter(
                CanvasThing.id.in_(request.thing_ids),
                CanvasThing.canvas_id == canvas_id
            ).all()
            
            for thing in things_to_delete:
                content = thing.content or {}
                asset_id = content.get("asset_id")
                
                db.delete(thing)
                
                if asset_id:
                    try:
                        from app.services.asset_service import asset_service
                        asset_service.delete_asset(db, asset_id)
                    except Exception as e:
                        print(f"Failed to delete asset {asset_id}: {e}")
                
            deleted_things_count = len(things_to_delete)

        # 3. Delete Domains
        if request.domain_ids:
            domains_to_delete = db.query(Domain).filter(
                Domain.id.in_(request.domain_ids),
                Domain.canvas_id == canvas_id
            ).all()
            
            for domain in domains_to_delete:
                db.delete(domain)
                
            deleted_domains_count = len(domains_to_delete)

        db.commit()
        
        return {
            "success": True,
            "deleted_things": deleted_things_count,
            "deleted_domains": deleted_domains_count
        }

    except Exception as e:
        db.rollback()
        print(f"Bulk delete error: {e}")
        raise HTTPException(status_code=500, detail=f"Bulk delete failed: {str(e)}")

class ExportDocxRequest(BaseModel):
    markdown: str

@router.post("/{canvas_id}/export-docx")
async def export_docx_endpoint(
    canvas_id: str,
    request: ExportDocxRequest,
    current_user: User = Depends(get_current_active_user)
):
    try:
        from app.utils.docx_exporter import generate_memo_docx
        from fastapi.responses import FileResponse
        
        docx_path = generate_memo_docx(request.markdown)
        
        return FileResponse(
            docx_path,
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            filename="Architecture_Memo.docx"
        )
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

class TimeMatrixExportRequest(BaseModel):
    apps: list

@router.post("/canvases/{canvas_id}/export-time-matrix")
async def export_time_matrix_docx_endpoint(
    canvas_id: str,
    request: TimeMatrixExportRequest,
    current_user: User = Depends(get_current_active_user)
):
    try:
        from app.utils.docx_exporter import generate_time_matrix_docx
        from fastapi.responses import FileResponse
        
        docx_path = generate_time_matrix_docx(request.model_dump())
        
        return FileResponse(
            docx_path,
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            filename="TIME_Matrix_Export.docx"
        )
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
