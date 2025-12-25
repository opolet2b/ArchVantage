"""
Prompt Management API

Endpoints for managing system prompts and user overrides.
"""
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.services.prompt_service import prompt_service
from app.schemas.prompt_schemas import PromptResponse, PromptOverrideCreate
from app.models.prompt_models import PromptOverride
from app.routers.auth import get_current_active_user
from app.models.user import User

router = APIRouter()

@router.get("/prompts", response_model=List[PromptResponse])
async def list_prompts(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """
    List all prompts in the registry.
    Enriches with status about active overrides for the current user.
    """
    definitions = prompt_service.get_all_definitions()
    response = []
    
    for definition in definitions:
        # Check for overrides
        # 1. User Specific
        user_override = db.query(PromptOverride).filter(
            PromptOverride.prompt_key == definition.key,
            PromptOverride.user_id == current_user.id,
            PromptOverride.is_active == True
        ).first()
        
        # 2. Global Admin (if needed, or check if user is admin?)
        # For now, let's just show if THIS user is affected.
        # If user is admin, maybe we show Global Override?
        # Let's keep it simple: Show EFFECTIVE override for this user.
        
        active_override_content = None
        is_overridden = False
        
        if user_override:
            active_override_content = user_override.content
            is_overridden = True
        else:
             # Check global
             global_override = db.query(PromptOverride).filter(
                PromptOverride.prompt_key == definition.key,
                PromptOverride.user_id == None,
                PromptOverride.is_active == True
             ).first()
             if global_override:
                 active_override_content = global_override.content
                 is_overridden = True

        response.append(PromptResponse(
            key=definition.key,
            group=definition.group,
            description=definition.description,
            default_content=definition.default_text,
            variables_schema=definition.variables,
            access_level=definition.access_level,
            last_synced_at=None, # In memory, doesn't have sync time handy unless we fetch from DB registry table.
            active_override=active_override_content,
            is_overridden=is_overridden
        ))
    
    return response

@router.post("/prompts/{key}/override", response_model=PromptResponse)
async def create_override(
    key: str,
    override_data: PromptOverrideCreate,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """
    Create or update a prompt override for the current user.
    """
    definition = prompt_service.get_definition(key)
    if not definition:
        raise HTTPException(status_code=404, detail="Prompt key not found")
        
    is_admin = any(r.name == "Admin" for r in current_user.roles)
    if definition.access_level == "read_only" and not is_admin:
        raise HTTPException(status_code=403, detail="This prompt is read-only")
        
    # Check existing
    override = db.query(PromptOverride).filter(
        PromptOverride.prompt_key == key,
        PromptOverride.user_id == current_user.id
    ).first()
    
    if override:
        override.content = override_data.content
        override.is_active = True
    else:
        override = PromptOverride(
            prompt_key=key,
            user_id=current_user.id,
            content=override_data.content,
            is_active=True
        )
        db.add(override)
    
    db.commit()
    db.refresh(override)
    
    # Return enriched response
    return PromptResponse(
        key=definition.key,
        group=definition.group,
        description=definition.description,
        default_content=definition.default_text,
        variables_schema=definition.variables,
        access_level=definition.access_level,
        last_synced_at=None,
        active_override=override.content,
        is_overridden=True
    )

@router.delete("/prompts/{key}/override")
async def delete_override(
    key: str,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """
    Remove user override (Reset to default).
    """
    override = db.query(PromptOverride).filter(
        PromptOverride.prompt_key == key,
        PromptOverride.user_id == current_user.id
    ).first()
    
    if not override:
        raise HTTPException(status_code=404, detail="No override found")
        
    db.delete(override)
    db.commit()
    return {"status": "success", "message": "Override deleted"}
