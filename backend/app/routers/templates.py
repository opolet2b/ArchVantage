"""
Templates Router

API endpoints for Templates Management Module.
Provides CRUD operations for templates and folders with permission checks.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import Optional, List
from pydantic import BaseModel

from app.core.database import get_db
from app.models.template import (
    Template, TemplateFolder, TemplatePermission, TemplatePermissionLevel
)
from app.models.user import User
from app.services.template_service import template_service
from app.routers.auth import get_current_user


router = APIRouter(prefix="/templates", tags=["templates"])


# ============== Pydantic Schemas ==============

class FolderCreate(BaseModel):
    """Schema for creating a folder."""
    name: str
    parent_id: Optional[str] = None


class TemplateCreate(BaseModel):
    """Schema for creating a template."""
    name: str
    folder_id: Optional[str] = None
    content: str = ""


class TemplateUpdate(BaseModel):
    """Schema for updating a template."""
    name: Optional[str] = None
    content: Optional[str] = None


class RenderPreviewRequest(BaseModel):
    """Schema for preview rendering."""
    yaml_content: str = ""
    markdown_content: str = ""


class GenerateRequest(BaseModel):
    """Schema for AI template generation."""
    description: str
    llm_model: str = "default"


class PermissionCreate(BaseModel):
    """Schema for creating a permission."""
    folder_id: str
    role_id: Optional[int] = None
    user_id: Optional[int] = None
    permission: str  # "READ", "WRITE", "DENY"


class TemplateConfig(BaseModel):
    """Schema for template storage configuration."""
    storage_backend: str = "database"  # "database" or "local"
    root_path: str = ""


# In-memory config storage (in production, use database or config file)
_template_config = {
    "storage_backend": "database",
    "root_path": ""
}


# ============== Config Endpoints ==============

@router.get("/config")
async def get_template_config(
    current_user: User = Depends(get_current_user)
):
    """Get template storage configuration. Admin only."""
    is_admin = any(role.name == "Admin" for role in current_user.roles)
    if not is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    return _template_config


@router.put("/config")
async def update_template_config(
    data: TemplateConfig,
    current_user: User = Depends(get_current_user)
):
    """Update template storage configuration. Admin only."""
    is_admin = any(role.name == "Admin" for role in current_user.roles)
    if not is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    _template_config["storage_backend"] = data.storage_backend
    _template_config["root_path"] = data.root_path
    
    return {"message": "Configuration saved"}


# ============== Endpoints ==============

@router.get("/tree")
async def get_template_tree(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Get the folder/template tree filtered by user permissions.
    
    Returns hierarchical structure with folders and templates
    the user has access to.
    """
    tree = template_service.get_tree(current_user.id, db)
    return {"tree": tree}


@router.get("/{template_id}")
async def get_template(
    template_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get a template by ID if user has READ permission."""
    template = db.query(Template).filter(Template.id == template_id).first()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    
    # Check permission on folder
    if template.folder_id:
        if not template_service.check_permission(
            current_user.id, 
            template.folder_id, 
            TemplatePermissionLevel.READ, 
            db
        ):
            raise HTTPException(status_code=403, detail="Permission denied")
    
    return {
        "id": template.id,
        "name": template.name,
        "path": template.path,
        "content": template.content,
        "folder_id": template.folder_id,
        "created_by": template.created_by,
        "last_modified": template.last_modified.isoformat() 
            if template.last_modified else None
    }


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_template(
    data: TemplateCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Create a new template. Requires WRITE permission on folder."""
    # Check permission on folder
    if data.folder_id:
        if not template_service.check_permission(
            current_user.id, 
            data.folder_id, 
            TemplatePermissionLevel.WRITE, 
            db
        ):
            raise HTTPException(status_code=403, detail="Permission denied")
    
    try:
        template = template_service.create_template(
            name=data.name,
            folder_id=data.folder_id,
            content=data.content,
            user_id=current_user.id,
            db=db
        )
        return {
            "id": template.id,
            "name": template.name,
            "path": template.path,
            "message": "Template created successfully"
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/{template_id}")
async def update_template(
    template_id: str,
    data: TemplateUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Update a template. Requires WRITE permission on folder."""
    template = db.query(Template).filter(Template.id == template_id).first()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    
    # Check permission on folder
    if template.folder_id:
        if not template_service.check_permission(
            current_user.id, 
            template.folder_id, 
            TemplatePermissionLevel.WRITE, 
            db
        ):
            raise HTTPException(status_code=403, detail="Permission denied")
    
    try:
        updated = template_service.update_template(
            template_id=template_id,
            name=data.name,
            content=data.content,
            db=db
        )
        return {
            "id": updated.id,
            "name": updated.name,
            "path": updated.path,
            "message": "Template updated successfully"
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/{template_id}")
async def delete_template(
    template_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Delete a template. Requires WRITE permission on folder."""
    template = db.query(Template).filter(Template.id == template_id).first()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    
    # Check permission on folder
    if template.folder_id:
        if not template_service.check_permission(
            current_user.id, 
            template.folder_id, 
            TemplatePermissionLevel.WRITE, 
            db
        ):
            raise HTTPException(status_code=403, detail="Permission denied")
    
    template_service.delete_template(template_id, db)
    return {"message": "Template deleted successfully"}


# ============== Folder Endpoints ==============

@router.post("/folders", status_code=status.HTTP_201_CREATED)
async def create_folder(
    data: FolderCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Create a new folder. Requires WRITE permission on parent folder or Admin for root."""
    # Check if user is admin
    is_admin = any(role.name == "Admin" for role in current_user.roles)
    
    # For root-level folders (no parent), require admin
    if not data.parent_id:
        if not is_admin:
            raise HTTPException(
                status_code=403, 
                detail="Admin access required to create root folders"
            )
    else:
        # For subfolders, check WRITE permission on parent
        if not is_admin and not template_service.check_permission(
            current_user.id, 
            data.parent_id, 
            TemplatePermissionLevel.WRITE, 
            db
        ):
            raise HTTPException(status_code=403, detail="Permission denied")
    
    try:
        folder = template_service.create_folder(
            name=data.name,
            parent_id=data.parent_id,
            user_id=current_user.id,
            db=db
        )
        return {
            "id": folder.id,
            "name": folder.name,
            "path": folder.path,
            "message": "Folder created successfully"
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/folders/{folder_id}")
async def delete_folder(
    folder_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Delete a folder. Must be empty. Requires WRITE permission."""
    folder = db.query(TemplateFolder).filter(
        TemplateFolder.id == folder_id
    ).first()
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")
    
    if not template_service.check_permission(
        current_user.id, 
        folder_id, 
        TemplatePermissionLevel.WRITE, 
        db
    ):
        raise HTTPException(status_code=403, detail="Permission denied")
    
    try:
        template_service.delete_folder(folder_id, db)
        return {"message": "Folder deleted successfully"}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# ============== Preview & Generation ==============

@router.post("/render-preview")
async def render_preview(
    data: RenderPreviewRequest,
    current_user: User = Depends(get_current_user)
):
    """
    Render HTML preview from YAML styles and markdown content.
    
    Used by the template editor for live preview.
    """
    html = template_service.render_preview(
        yaml_content=data.yaml_content,
        markdown_content=data.markdown_content
    )
    return {"html": html}


@router.post("/generate")
async def generate_template(
    data: GenerateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Generate a template using AI from natural language description.
    
    Returns complete markdown with YAML frontmatter.
    """
    try:
        content = await template_service.generate_template(
            description=data.description,
            llm_model=data.llm_model
        )
        return {"content": content}
    except Exception as e:
        raise HTTPException(
            status_code=500, 
            detail=f"Generation failed: {str(e)}"
        )


# ============== Permission Management (Admin Only) ==============

@router.get("/folders/{folder_id}/permissions")
async def get_folder_permissions(
    folder_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get permissions for a folder. Admin only."""
    # Check if user is admin
    is_admin = any(role.name == "Admin" for role in current_user.roles)
    if not is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    permissions = db.query(TemplatePermission).filter(
        TemplatePermission.folder_id == folder_id
    ).all()
    
    return {
        "permissions": [
            {
                "id": p.id,
                "folder_id": p.folder_id,
                "role_id": p.role_id,
                "user_id": p.user_id,
                "permission": p.permission.value
            }
            for p in permissions
        ]
    }


@router.post("/folders/{folder_id}/permissions")
async def add_folder_permission(
    folder_id: str,
    data: PermissionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Add permission to a folder. Admin only."""
    # Check if user is admin
    is_admin = any(role.name == "Admin" for role in current_user.roles)
    if not is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    # Validate permission level
    try:
        permission_level = TemplatePermissionLevel(data.permission)
    except ValueError:
        raise HTTPException(
            status_code=400, 
            detail="Invalid permission level. Use READ, WRITE, or DENY"
        )
    
    # Check folder exists
    folder = db.query(TemplateFolder).filter(
        TemplateFolder.id == folder_id
    ).first()
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")
    
    permission = TemplatePermission(
        folder_id=folder_id,
        role_id=data.role_id,
        user_id=data.user_id,
        permission=permission_level
    )
    db.add(permission)
    db.commit()
    db.refresh(permission)
    
    return {
        "id": permission.id,
        "message": "Permission added successfully"
    }


@router.delete("/permissions/{permission_id}")
async def delete_permission(
    permission_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Delete a permission. Admin only."""
    # Check if user is admin
    is_admin = any(role.name == "Admin" for role in current_user.roles)
    if not is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    permission = db.query(TemplatePermission).filter(
        TemplatePermission.id == permission_id
    ).first()
    if not permission:
        raise HTTPException(status_code=404, detail="Permission not found")
    
    db.delete(permission)
    db.commit()
    return {"message": "Permission deleted successfully"}
