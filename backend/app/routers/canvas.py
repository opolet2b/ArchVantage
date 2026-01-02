"""
Semantic Canvas Router

API endpoints for the semantic canvas feature.
Handles CRUD operations for canvases, things, links, and domains.

PEP 8 Compliant
"""
from typing import List
import traceback
from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified

from sqlalchemy import or_
from app.core.database import get_db
from app.routers.auth import get_current_active_user
from app.models.user import User, Role
from app.models.canvas_models import (
    Canvas, CanvasThing, CanvasLink, Domain,
    ThingType as ModelThingType, LinkType as ModelLinkType, RAGStatus
)
from app.schemas.canvas_schemas import (
    CanvasCreate, CanvasUpdate, CanvasResponse, CanvasWithContents,
    ThingCreate, ThingUpdate, ThingResponse,
    LinkCreate, LinkUpdate, LinkResponse,
    DomainCreate, DomainUpdate, DomainResponse,
    SummarizeRequest, SummarizeResponse,
    AnalyzeRequest, AnalyzeResponse, AnalyzeAction,
    DiscoverLinksRequest, DiscoverLinksResponse,
    ExecuteTemplateRequest, ExecuteTemplateResponse
)
from app.services.rag_service import rag_service
from app.services.smart_template_service import smart_template_service
from app.routers.canvas_worker import handle_async_vectorization
from pydantic import BaseModel


router = APIRouter()


# =============================================================================
# Canvas CRUD
# =============================================================================

@router.post("/canvases", response_model=CanvasResponse)
def create_canvas(
    request: CanvasCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Create a new canvas for the current user."""
    canvas = Canvas(
        owner_id=current_user.id,
        name=request.name,
        description=request.description
    )
    
    # Set permissions
    if request.allowed_user_ids:
        users = db.query(User).filter(User.id.in_(request.allowed_user_ids)).all()
        canvas.allowed_users = users
        
    if request.allowed_role_ids:
        roles = db.query(Role).filter(Role.id.in_(request.allowed_role_ids)).all()
        canvas.allowed_roles = roles
        
    db.add(canvas)
    db.commit()
    db.refresh(canvas)
    return canvas


@router.get("/canvases", response_model=List[CanvasResponse])
def list_canvases(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """List all canvases owned by or shared with the current user."""
    # Get user's role IDs
    user_role_ids = [role.id for role in current_user.roles]
    
    canvases = db.query(Canvas).filter(
        or_(
            Canvas.owner_id == current_user.id,
            Canvas.allowed_users.any(id=current_user.id),
            Canvas.allowed_roles.any(Role.id.in_(user_role_ids))
        )
    ).all()
    return canvases


@router.get("/canvases/{canvas_id}", response_model=CanvasWithContents)
def get_canvas(
    canvas_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Get a canvas with all its contents (things, links, domains)."""
    # Get user's role IDs
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
    
    return canvas


@router.patch("/canvases/{canvas_id}", response_model=CanvasResponse)
def update_canvas(
    canvas_id: str,
    request: CanvasUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Update canvas properties."""
    # Only owner or explicit write access (treated same as read for now) can update
    # Ideally, we should check for "Write" permission if we had granular permissions.
    # For now, we allow update if user has access.
    
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
    
    # Update fields
    if request.name is not None:
        canvas.name = request.name
    if request.description is not None:
        canvas.description = request.description
    if request.viewport is not None:
        canvas.viewport = request.viewport.model_dump()
        
    # Update Permissions (Only Owner can change permissions?)
    # Let's say yes, only owner can manage permissions.
    if (request.allowed_user_ids is not None or request.allowed_role_ids is not None) and canvas.owner_id != current_user.id:
        raise HTTPException(
             status_code=status.HTTP_403_FORBIDDEN,
             detail="Only the owner can manage permissions"
        )

    if request.allowed_user_ids is not None:
        users = db.query(User).filter(User.id.in_(request.allowed_user_ids)).all()
        canvas.allowed_users = users
        
    if request.allowed_role_ids is not None:
        roles = db.query(Role).filter(Role.id.in_(request.allowed_role_ids)).all()
        canvas.allowed_roles = roles
    
    db.commit()
    db.refresh(canvas)
    return canvas


@router.delete("/canvases/{canvas_id}")
def delete_canvas(
    canvas_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Delete a canvas and all its contents."""
    canvas = db.query(Canvas).filter(
        Canvas.id == canvas_id,
        Canvas.owner_id == current_user.id
    ).first()
    
    if not canvas:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Canvas not found"
        )
    
    db.delete(canvas)
    db.commit()
    return {"message": "Canvas deleted"}


# =============================================================================
# Things CRUD
# =============================================================================

@router.post("/canvases/{canvas_id}/things", response_model=ThingResponse)
async def create_thing(
    canvas_id: str,
    request: ThingCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Add a thing to the canvas."""
    print(f"[CanvasRouter] Received create_thing request for canvas {canvas_id}, type: {request.type}")
    print(f"[CanvasRouter] Request Domain ID: {request.domain_id}")
    try:
        # Verify canvas ownership
        canvas = db.query(Canvas).filter(
            Canvas.id == canvas_id,
            Canvas.owner_id == current_user.id
        ).first()
        
        if not canvas:
            print(f"[CanvasRouter] Canvas {canvas_id} not found for user {current_user.id}")
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Canvas not found"
            )
        
        thing = CanvasThing(
            canvas_id=canvas_id,
            type=ModelThingType(request.type.value),
            content=request.content,
            position_x=request.position.x,
            position_y=request.position.y,
            width=request.size.width if request.size else None,
            height=request.size.height if request.size else None,
            domain_id=request.domain_id if request.domain_id else None,
            title=request.title
        )
        print(f"[CanvasRouter] Adding thing to DB: {thing}")
        db.add(thing)
        db.commit()
        db.refresh(thing)
        print(f"[CanvasRouter] Thing created successfully: {thing.id}")

        # Trigger RAG Ingestion for Documents, Images, and Slideshows
        if thing.type in [ModelThingType.DOCUMENT, ModelThingType.IMAGE, ModelThingType.SLIDESHOW]:
            try:
                # Logic to find the file execution.
                asset_id = thing.content.get("asset_id")
                
                real_path = None
                
                if asset_id:
                     # Query the Asset table to get the real file path
                     from app.models.asset_models import Asset
                     from app.services.asset_service import STORAGE_ROOT
                     
                     asset_record = db.query(Asset).filter(Asset.id == asset_id).first()
                     if asset_record:
                         # Construct full path: STORAGE_ROOT / asset_record.file_path
                         # Note: file_path in DB is relative (e.g. 2024/12/21/uuid_file.pdf)
                         full_path = STORAGE_ROOT / asset_record.file_path
                         if full_path.exists():
                             real_path = str(full_path)
                             print(f"[CanvasRouter] Resolved asset path: {real_path}")
                         else:
                             print(f"[CanvasRouter] Asset file missing on disk: {full_path}")
                     else:
                         print(f"[CanvasRouter] Asset record not found for ID: {asset_id}")
                
                # Support for Image-Based Slideshows (Synthetic)
                elif thing.content.get("source_type") == "image_folder":
                    real_path = "IMAGE_FOLDER_MODE"
                    print(f"[CanvasRouter] Identified Image-Based Slideshow. Triggering worker.")
                
                if real_path:
                    print(f"[CanvasRouter] Triggering Async Vectorization for {real_path}")
                    
                    # Set status to PENDING
                    thing.rag_status = RAGStatus.PENDING
                    db.commit() # Save pending status before offloading
                    
                    # Offload blocking ingestion to background task
                    background_tasks.add_task(
                        handle_async_vectorization, 
                        thing.id,
                        real_path, 
                        canvas_id
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
    current_user: User = Depends(get_current_active_user)
):
    """List all things on a canvas."""
    # Verify canvas ownership
    canvas = db.query(Canvas).filter(
        Canvas.id == canvas_id,
        Canvas.owner_id == current_user.id
    ).first()
    
    if not canvas:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Canvas not found"
        )
    
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
    thing = db.query(CanvasThing).join(Canvas).filter(
        CanvasThing.id == thing_id,
        CanvasThing.canvas_id == canvas_id,
        Canvas.owner_id == current_user.id
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
    thing = db.query(CanvasThing).join(Canvas).filter(
        CanvasThing.id == thing_id,
        CanvasThing.canvas_id == canvas_id,
        Canvas.owner_id == current_user.id
    ).first()
    
    if not thing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Thing not found"
        )
    
    from sqlalchemy.orm.attributes import flag_modified
    
    # Update fields
    # Update fields
    if request.content is not None:
        print(f"[CanvasRouter] Updating thing {thing_id} content. Regions: {request.content.get('regions')}")
        
        # Robust Merge: Protect critical VLM fields from being overwritten by stale frontend state
        existing_content = thing.content or {}
        new_content = request.content.copy() # Ensure we don't modify the input
        
        preserved_fields = ["description", "generated_description", "vision_model", "source_image", "generated_at"]
        for field in preserved_fields:
            # If the field exists in DB but is missing/empty in the request, keep the DB version
            # This handles the case where frontend sends a stale 'content' object without the async-generated description
            if existing_content.get(field) and not new_content.get(field):
                print(f"[CanvasRouter] Preserving critical field '{field}' during update.")
                new_content[field] = existing_content[field]
        
        thing.content = new_content
        flag_modified(thing, "content") # Explicitly flag JSON as modified
        print(f"[CanvasRouter] Content updated and flagged modified. Keys: {new_content.keys()}")
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


@router.delete("/canvases/{canvas_id}/things/{thing_id}")
def delete_thing(
    canvas_id: str,
    thing_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Delete a thing from the canvas."""
    thing = db.query(CanvasThing).join(Canvas).filter(
        CanvasThing.id == thing_id,
        CanvasThing.canvas_id == canvas_id,
        Canvas.owner_id == current_user.id
    ).first()
    
    if not thing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Thing not found"
        )
    
    
    # Clean up associated assets (physical files)
    if thing.content and "asset_id" in thing.content:
        asset_id = thing.content["asset_id"]
        from app.services.asset_service import asset_service
        try:
            # We assume current_user is owner as verified by query above
            print(f"[CanvasRouter] Deleting associated asset {asset_id} for thing {thing_id}")
            asset_service.delete_asset(db, asset_id, current_user.id)
        except Exception as e:
            print(f"[CanvasRouter] Warning: Failed to delete asset {asset_id}: {e}")
            # Continue deleting the thing itself
            
    db.delete(thing)
    db.commit()
    return {"message": "Thing deleted"}


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
    # Verify canvas ownership
    canvas = db.query(Canvas).filter(
        Canvas.id == canvas_id,
        Canvas.owner_id == current_user.id
    ).first()
    
    if not canvas:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Canvas not found"
        )
    
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
    target = db.query(CanvasThing).filter(
        CanvasThing.id == request.target_id,
        CanvasThing.canvas_id == canvas_id
    ).first()

    if not target:
        target = db.query(Domain).filter(
            Domain.id == request.target_id,
            Domain.canvas_id == canvas_id
        ).first()
    
    if not source or not target:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Source or target (Thing/Domain) not found on this canvas"
        )
    
    link = CanvasLink(
        canvas_id=canvas_id,
        source_id=request.source_id,
        target_id=request.target_id,
        type=ModelLinkType(request.type.value),
        label=request.label,
        source_fragment=request.source_fragment,
        target_fragment=request.target_fragment
    )
    db.add(link)
    db.commit()
    db.refresh(link)
    return link


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
    link = db.query(CanvasLink).join(Canvas).filter(
        CanvasLink.id == link_id,
        CanvasLink.canvas_id == canvas_id,
        Canvas.owner_id == current_user.id
    ).first()
    
    if not link:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Link not found"
        )
    
    # Update type if provided
    if request.type is not None:
        link.type = ModelLinkType(request.type.value)
    
    # Update label if provided (can be set to None with empty string)
    if request.label is not None:
        link.label = request.label if request.label else None
    
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
    link = db.query(CanvasLink).join(Canvas).filter(
        CanvasLink.id == link_id,
        CanvasLink.canvas_id == canvas_id,
        Canvas.owner_id == current_user.id
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
    # Verify canvas ownership
    canvas = db.query(Canvas).filter(
        Canvas.id == canvas_id,
        Canvas.owner_id == current_user.id
    ).first()
    
    if not canvas:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Canvas not found"
        )
    
    domain = Domain(
        canvas_id=canvas_id,
        name=request.name,
        color=request.color,
        position_x=request.position.x,
        position_y=request.position.y,
        description=request.description,
        parent_id=request.parent_id if request.parent_id else None
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
    domain = db.query(Domain).join(Canvas).filter(
        Domain.id == domain_id,
        Domain.canvas_id == canvas_id,
        Canvas.owner_id == current_user.id
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
    domain = db.query(Domain).join(Canvas).filter(
        Domain.id == domain_id,
        Domain.canvas_id == canvas_id,
        Canvas.owner_id == current_user.id
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
def summarize_thing(
    canvas_id: str,
    thing_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Generate AI summaries for a thing at different zoom levels.
    """
    thing = db.query(CanvasThing).join(Canvas).filter(
        CanvasThing.id == thing_id,
        CanvasThing.canvas_id == canvas_id,
        Canvas.owner_id == current_user.id
    ).first()
    
    if not thing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Thing not found"
        )
    
    # TODO: Integrate with LLM service to generate summaries
    # For now, generate placeholder summaries based on content
    content_text = ""
    if thing.type == ModelThingType.TEXT:
        content_text = thing.content.get("text", "")
    elif thing.type == ModelThingType.CONVERSATION:
        messages = thing.content.get("messages", [])
        content_text = " ".join([m.get("content", "") for m in messages])
    elif thing.type == ModelThingType.DOCUMENT:
        content_text = thing.content.get("content", "")
    else:
        content_text = str(thing.content)
    
    # Generate summaries at different zoom levels
    # 0.3 = one line, 0.5 = paragraph
    summaries = {
        "0.3": content_text[:50] + "..." if len(content_text) > 50 else content_text,
        "0.5": content_text[:200] + "..." if len(content_text) > 200 else content_text
    }
    
    # Store summaries
    thing.summaries = summaries
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
    # We reuse the logic from get_canvas
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
        k=request.k
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
    current_user: User = Depends(get_current_active_user)
):
    """
    Analyze selected content using LLM.
    Supports summarize, explain, extract_points, and ask actions.
    Supports text and image content.
    """
    # Verify canvas ownership
    canvas = db.query(Canvas).filter(
        Canvas.id == canvas_id,
        Canvas.owner_id == current_user.id
    ).first()
    
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
    
    # Phase 2: RAG Integration for Slideshows
    # If this is a slideshow and the content looks like metadata (JSON), 
    # we should fetch relevant text from the Vector Store to give the LLM context.
    if thing.type.value == "slideshow":
        # Check if RAG is available
        # Note: thing.rag_status is a DB Column enum (or string in some contexts?)
        # Enum comparison should work if imports are correct.
        if thing.rag_status == RAGStatus.COMPLETED or str(thing.rag_status) == "completed":
             print(f"[Analyze] Detected Slideshow with RAG. Fetching context...")
             
             # If action is ASK, search for the user's prompt. Otherwise summarize.
             query_text = "Summarize this presentation"
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
 
                 results = rag_service.search(query=query_text, k=5, filters=search_filters)
                 
                 if results:
                     # Join chunks to form context
                     context_texts = [r['text'] for r in results]
                     
                     # PREPEND SYSTEM INSTRUCTION FOR SPATIAL AWARENESS
                     system_note = (
                        "SYSTEM NOTE: The following context describes slides with spatial coordinates (x,y,w,h normalized 0.0-1.0) "
                        "and visual attributes (Shape Type, Colors). "
                        "Use this to mentally reconstruct the visual layout and hierarchy. "
                        "Coordinates: x=0 (left), y=0 (top). "
                        "Visuals are described as [TYPE] (Layout...) (Color...) \"Text\"."
                     )
                     
                     selected_content = f"{system_note}\n\nRelevant Slides/Context:\n" + "\n---\n".join(context_texts)
                     print(f"[Analyze] Retrieved {len(results)} chunks from RAG for context.")
                 else:
                     selected_content = "No relevant context found in RAG index for this query."
             except Exception as e:
                 print(f"[Analyze] RAG Search failed: {e}")
                 # Fallback to existing content (metadata)

    if not selected_content:
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

    
    # Imports for Prompt Service
    from app.services.prompt_service import prompt_service
    from app.prompts import SUMMARIZE_PROMPT, EXPLAIN_PROMPT

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

    model_name = request.model or "default"

    try:
        # Check for image data
        image_payload = request.image_data
        # If fragment is region and has content (base64), use that
        if not image_payload and request.fragment.content:
            # Check if content is base64
            content_str = str(request.fragment.content)
            if "base64," in content_str[:100] or (len(content_str) > 5000 and not " " in content_str[:100]):
                 # Assume it's an image if it has base64 header or is a long string without spaces (raw base64)
                 # Note: raw base64 usually doesn't have spaces.
                 image_payload = request.fragment.content
                 print(f"[Analyze] Detected base64 content in fragment type '{request.fragment.type}'")

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
                model_name=model_name
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
            response = await llm_service.chat(
                messages=[
                    Message(role="system", content=system_prompt),
                    Message(role="user", content=user_prompt)
                ],
                model_name=request.model
            )
            print(f"[Analyze] LLM Response received (len={len(response)})")
        
        return AnalyzeResponse(
            thing_id=request.thing_id,
            action=request.action,
            result=response,
            created_thing_id=None 
        )

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
    from app.services.llm_service import llm_service
    from app.models.chat import Message
    from app.schemas.canvas_schemas import DiscoverLinksResponse, DiscoveredLinkDetail
    from app.services.debug_service import debug_service
    import json

    debug_service.log("INFO", "DiscoverLinks", f"Starting discovery for Canvas {canvas_id}", {
        "thing_ids": request.thing_ids,
        "domain_ids": request.domain_ids,
        "model": request.model
    })

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
        
    try:
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
                    debug_service.log("DEBUG", "DiscoverLinks", f"Checking RAG status for {thing.id}: {thing.rag_status}")
                    
                    if thing.rag_status and thing.rag_status.lower() == "completed":
                        try:
                            from app.services.rag_service import rag_service
                            # Correct filter is 'thing_id' as set in canvas_worker.py
                            filters = {"thing_id": thing.id}
                            
                            debug_service.log("DEBUG", "DiscoverLinks", f"Fetching RAG context for {thing.id} with filters {filters}...")
                            
                            results = rag_service.search(
                                query="Summary and key themes of this document",
                                filters=filters,
                                k=3
                            )
                            
                            if not results:
                                 # Fallback: Try searching by filename if thing_id didn't work (unlikely if status is completed)
                                filename = content.get("filename")
                                if filename:
                                    debug_service.log("WARN", "DiscoverLinks", f"No results for thing_id {thing.id}, trying filename {filename}")
                                    # SimpleDirectoryReader often adds 'file_name' to metadata
                                    results = rag_service.search(
                                        query="Summary and key themes of this document",
                                        filters={"file_name": filename},
                                        k=3
                                    )

                            if results:
                                debug_service.log("INFO", "DiscoverLinks", f"Found {len(results)} RAG chunks for {thing.id}")
                                rag_context = "\n".join([r["text"] for r in results])
                                summary += f"\n\nContext:\n{rag_context}"
                            else:
                                debug_service.log("WARN", "DiscoverLinks", f"No RAG results found for {thing.id} after fallback.")
                                
                        except Exception as e:
                            debug_service.log("ERROR", "DiscoverLinks", f"Failed to fetch RAG context for thing {thing.id}: {e}")
                    else:
                        debug_service.log("WARN", "DiscoverLinks", f"Skipping RAG for {thing.id} - status is {thing.rag_status}")
                elif thing.type == ModelThingType.IMAGE:
                     summary = "Image (No description available)"
                
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
        
        debug_service.log("INFO", "DiscoverLinks", f"Entities collected: {len(things_map)} Things, {len(domains_map)} Domains", {
            "things": things_map,
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
                    "label": "A descriptive phrase explaining the link (max 5-6 words)",
                    "rationale": "Brief explanation of why this link exists"
                }
            ]
        }

        ### Rules for High-Quality Links:
        1. **BE SPECIFIC**: Never use generic labels like "references" or "relates to". 
           - BAD: Label="references"
           - GOOD: Label="provides statistical evidence for"
           - GOOD: Label="defines the protocol used in"
        2. **PREFER CAUSALITY**: If A causes B, or A is needed for B, use `triggers`, `influences`, or `prerequisites`.
        3. **AVOID OBVIOUS**: Do not link things just because they are in the same domain. Link them only if their *content* interacts.
        4. **DIRECTION MATTERS**: Ensure source->target direction makes logical sense for the chosen type (e.g. Evidence -> Hypothesis = PROVES).
        5. **MULTIPLE LINKS**: It is acceptable to create multiple links between the same two entities IF they represent distinct relationships (e.g. A 'references' B AND A 'refutes' B).
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
        debug_service.log("DEBUG", "DiscoverLinks", "Prompt Constructed", {
            "system_prompt": system_prompt,
            "user_prompt_preview": user_prompt[:1000] + "..." if len(user_prompt) > 1000 else user_prompt
        })


        # 4. Call LLM
        from app.services.config_service import config_service
        
        # Resolve Model Preset if needed
        model_name = request.model
        config = config_service.get_config()
        presets = config.get("presets", [])
        
        # Check if request.model matches a preset name
        matched_preset = next((p for p in presets if p["name"] == model_name), None)
        
        if matched_preset:
            if matched_preset["type"] == "local":
                model_name = matched_preset.get("model_name", model_name)
                debug_service.log("INFO", "DiscoverLinks", f"Resolved preset '{request.model}' to local model '{model_name}'")
            else:
                 model_name = matched_preset.get("model_name") or request.model
                 debug_service.log("INFO", "DiscoverLinks", f"Resolved remote preset '{request.model}' to '{model_name}'")
        else:
             debug_service.log("WARN", "DiscoverLinks", f"No preset found for '{request.model}', using as raw model name.")

        response_text = await llm_service.chat(
            messages=[
                Message(role="system", content=system_prompt),
                Message(role="user", content=user_prompt)
            ],
            model_name=model_name,
            response_format={"type": "json_object"}
        )
        
        debug_service.log("DEBUG", "DiscoverLinks", "LLM Response Received", {"response": response_text})

        
        # Parse JSON
        import json
        try:
            # Handle potential markdown wrapping
            cleaned_text = response_text.replace("```json", "").replace("```", "").strip()
            result_json = json.loads(cleaned_text)
            links_data = result_json.get("links", [])
        except json.JSONDecodeError as je:
            debug_service.log("ERROR", "DiscoverLinks", "Failed to parse JSON response", {"response_text": response_text, "error": str(je)})
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
            l_type = link_data.get("type", "related").lower()
            label = link_data.get("label", "")
            
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
                
            # Create Link
            new_link = CanvasLink(
                canvas_id=canvas_id,
                source_id=source,
                target_id=target,
                type=model_type,
                label=label or None
            )
            db.add(new_link)
            created_count += 1
            existing_keys.add((source, target, model_type))
            
            created_links.append(DiscoveredLinkDetail(
                source_id=source,
                target_id=target,
                type=model_type.value,
                label=label,
                rationale=link_data.get("rationale")
            ))
            
        db.commit()
        
        debug_service.log("INFO", "DiscoverLinks", f"Discovery complete. Created {created_count} new links.")
        
        return DiscoverLinksResponse(
            links_created=created_count,
            domains_updated=0,
            details=created_links
        )

    except Exception as e:
        debug_service.log("ERROR", "DiscoverLinks", f"Unexpected Error: {str(e)}", {"traceback": traceback.format_exc()})
        print(f"[DiscoverLinks] Error: {e}")

        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


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

    async def event_generator():
        try:
            print(f"[Stream] Starting template execution for {request.template_id}")
            async for event in smart_template_service.execute_template_stream(db, request):
                yield json.dumps(event, cls=SafeJSONEncoder) + "\n"
        except Exception as e:
            print(f"[Stream] Error: {e}")
            traceback.print_exc()
            yield json.dumps({"type": "error", "content": str(e)}, cls=SafeJSONEncoder) + "\n"
            
    return StreamingResponse(event_generator(), media_type="application/x-ndjson")

