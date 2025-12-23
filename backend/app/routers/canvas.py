"""
Semantic Canvas Router

API endpoints for the semantic canvas feature.
Handles CRUD operations for canvases, things, links, and domains.

PEP 8 Compliant
"""
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.routers.auth import get_current_active_user
from app.models.user import User
from app.models.canvas_models import (
    Canvas, CanvasThing, CanvasLink, Domain,
    ThingType as ModelThingType, LinkType as ModelLinkType
)
from app.schemas.canvas_schemas import (
    CanvasCreate, CanvasUpdate, CanvasResponse, CanvasWithContents,
    ThingCreate, ThingUpdate, ThingResponse,
    LinkCreate, LinkUpdate, LinkResponse,
    DomainCreate, DomainUpdate, DomainResponse,
    SummarizeRequest, SummarizeResponse,
    AnalyzeRequest, AnalyzeResponse, AnalyzeAction
)


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
    db.add(canvas)
    db.commit()
    db.refresh(canvas)
    return canvas


@router.get("/canvases", response_model=List[CanvasResponse])
def list_canvases(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """List all canvases owned by the current user."""
    canvases = db.query(Canvas).filter(
        Canvas.owner_id == current_user.id
    ).all()
    return canvases


@router.get("/canvases/{canvas_id}", response_model=CanvasWithContents)
def get_canvas(
    canvas_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Get a canvas with all its contents (things, links, domains)."""
    canvas = db.query(Canvas).filter(
        Canvas.id == canvas_id,
        Canvas.owner_id == current_user.id
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
    canvas = db.query(Canvas).filter(
        Canvas.id == canvas_id,
        Canvas.owner_id == current_user.id
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
def create_thing(
    canvas_id: str,
    request: ThingCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Add a thing to the canvas."""
    print(f"[CanvasRouter] Received create_thing request for canvas {canvas_id}, type: {request.type}")
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
    
    return canvas.things


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
    
    # Update fields
    if request.content is not None:
        thing.content = request.content
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
    
    # Verify both things exist on this canvas
    source = db.query(CanvasThing).filter(
        CanvasThing.id == request.source_id,
        CanvasThing.canvas_id == canvas_id
    ).first()
    target = db.query(CanvasThing).filter(
        CanvasThing.id == request.target_id,
        CanvasThing.canvas_id == canvas_id
    ).first()
    
    if not source or not target:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Source or target thing not found on this canvas"
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
    Summaries are stored and returned for semantic zoom rendering.
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
    # print(f"[AnalyzeEndpoint] Selected content type: {type(selected_content)}")
    # print(f"[AnalyzeEndpoint] Selected content preview: {str(selected_content)[:200]}")
    
    if not selected_content:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No content selected for analysis"
        )
    
    # Build prompt based on action
    # If content looks like base64 or is very long, don't put it all in the text prompt
    content_for_prompt = selected_content
    if len(selected_content) > 1000 or "base64" in str(selected_content).lower():
         content_for_prompt = "[Image Content]"

    if request.action == AnalyzeAction.SUMMARIZE:
        system_prompt = "You are a helpful assistant. Provide concise, clear summaries."
        user_prompt = f"Please provide a concise summary of the following content:\n\n{content_for_prompt}"
    elif request.action == AnalyzeAction.EXPLAIN:
        system_prompt = "You are a helpful assistant. Explain concepts clearly and simply."
        user_prompt = f"Please explain the following content in simple, clear terms:\n\n{content_for_prompt}"
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

            result = await vision_service.analyze(
                image_data=image_payload,
                prompt=final_user_prompt,
                system_prompt=final_system_prompt,
                model_name=model_name
            )
        else:
            # Standard Text LLM
            messages = [
                Message(role="system", content=system_prompt),
                Message(role="user", content=user_prompt)
            ]
            result = await llm_service.chat(messages, model_name)
            
    except Exception as e:
        print(f"[Analyze] LLM/Vision error: {e}")
        result = f"Error analyzing content: {str(e)}"
    
    return AnalyzeResponse(
        thing_id=request.thing_id,
        action=request.action,
        result=result,
        created_thing_id=None
    )
