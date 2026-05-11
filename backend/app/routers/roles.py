from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.models.user import Role, KnownADGroup, GroupMapping, User, UserRole, UserRoleSource
from app.schemas.user import Role as RoleSchema, RoleCreate, KnownADGroup as KnownADGroupSchema, GroupMappingCreate
from app.routers.auth import get_current_admin_user, PermissionChecker

router = APIRouter()

@router.get("/roles", response_model=List[RoleSchema])
def read_roles(
    skip: int = 0, 
    limit: int = 100, 
    db: Session = Depends(get_db), 
    current_user: User = Depends(PermissionChecker("role:manage"))
):
    roles = db.query(Role).offset(skip).limit(limit).all()
    return roles

@router.post("/roles", response_model=RoleSchema)
def create_role(
    role: RoleCreate, 
    db: Session = Depends(get_db), 
    current_user: User = Depends(PermissionChecker("role:manage"))
):
    db_role = db.query(Role).filter(Role.name == role.name).first()
    if db_role:
        raise HTTPException(status_code=400, detail="Role already exists")
    
    db_role = Role(name=role.name, description=role.description, permissions=role.permissions)
    db.add(db_role)
    db.commit()
    db.refresh(db_role)
    return db_role

@router.put("/roles/{role_id}", response_model=RoleSchema)
def update_role(
    role_id: int,
    role_update: RoleCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker("role:manage"))
):
    db_role = db.query(Role).filter(Role.id == role_id).first()
    if not db_role:
        raise HTTPException(status_code=404, detail="Role not found")
    
    # Check if new name conflicts with existing role
    if role_update.name != db_role.name:
        existing = db.query(Role).filter(Role.name == role_update.name).first()
        if existing:
            raise HTTPException(status_code=400, detail="Role name already exists")
    
    db_role.name = role_update.name
    db_role.description = role_update.description
    db_role.permissions = role_update.permissions
    db.commit()
    db.refresh(db_role)
    return db_role


@router.delete("/roles/{role_id}")
def delete_role(
    role_id: int, 
    db: Session = Depends(get_db), 
    current_user: User = Depends(PermissionChecker("role:manage"))
):
    db_role = db.query(Role).filter(Role.id == role_id).first()
    if not db_role:
        raise HTTPException(status_code=404, detail="Role not found")
    
    if db_role.name == "User":
        raise HTTPException(status_code=400, detail="Cannot delete default User role")
    
    # Get the default 'User' role
    user_role = db.query(Role).filter(Role.name == "User").first()
    if not user_role:
        raise HTTPException(status_code=500, detail="Default User role not found")
    
    # Find all users who have ONLY this role
    user_roles = db.query(UserRole).filter(UserRole.role_id == role_id).all()
    for ur in user_roles:
        # Count how many roles this user has
        user_role_count = db.query(UserRole).filter(UserRole.user_id == ur.user_id).count()
        if user_role_count == 1:
            # User has only this role, assign User role
            new_user_role = UserRole(
                user_id=ur.user_id,
                role_id=user_role.id,
                source=UserRoleSource.MANUAL
            )
            db.add(new_user_role)
    
    # Update group mappings to point to User role
    group_mappings = db.query(GroupMapping).filter(GroupMapping.role_id == role_id).all()
    for gm in group_mappings:
        gm.role_id = user_role.id
    
    db.commit()
    
    # Now delete the role (cascade will handle UserRole deletions)
    db.delete(db_role)
    db.commit()
    return {"ok": True}

@router.get("/ad-groups", response_model=List[KnownADGroupSchema])
def read_ad_groups(
    skip: int = 0, 
    limit: int = 100, 
    db: Session = Depends(get_db), 
    current_user: User = Depends(PermissionChecker("role:manage"))
):
    groups = db.query(KnownADGroup).offset(skip).limit(limit).all()
    return groups

@router.post("/group-mappings")
def create_group_mapping(
    mapping: GroupMappingCreate, 
    db: Session = Depends(get_db), 
    current_user: User = Depends(PermissionChecker("role:manage"))
):
    # Check if mapping exists
    existing = db.query(GroupMapping).filter(
        GroupMapping.ad_group_id == mapping.ad_group_id,
        GroupMapping.role_id == mapping.role_id
    ).first()
    
    if existing:
        return {"ok": True, "message": "Mapping already exists"}
        
    new_mapping = GroupMapping(ad_group_id=mapping.ad_group_id, role_id=mapping.role_id)
    db.add(new_mapping)
    db.commit()
    return {"ok": True}

@router.get("/group-mappings")
def get_group_mappings(
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker("role:manage"))
):
    """Get all group mappings with details"""
    mappings = db.query(GroupMapping).all()
    result = []
    for mapping in mappings:
        ad_group = db.query(KnownADGroup).filter(KnownADGroup.id == mapping.ad_group_id).first()
        role = db.query(Role).filter(Role.id == mapping.role_id).first()
        if ad_group and role:
            result.append({
                "id": mapping.id,
                "ad_group": {
                    "id": ad_group.id,
                    "ad_group_oid": ad_group.ad_group_oid,
                    "display_name": ad_group.display_name,
                    "is_manually_added": ad_group.is_manually_added
                },
                "role": {
                    "id": role.id,
                    "name": role.name
                }
            })
    return result

@router.delete("/group-mappings/{mapping_id}")
def delete_group_mapping(
    mapping_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker("role:manage"))
):
    mapping = db.query(GroupMapping).filter(GroupMapping.id == mapping_id).first()
    if not mapping:
        raise HTTPException(status_code=404, detail="Mapping not found")
    
    db.delete(mapping)
    db.commit()
    return {"ok": True}

@router.post("/ad-groups/manual")
def add_manual_ad_group(
    ad_group_oid: str,
    display_name: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker("role:manage"))
):
    """Manually add an AD group that hasn't been discovered yet"""
    existing = db.query(KnownADGroup).filter(KnownADGroup.ad_group_oid == ad_group_oid).first()
    if existing:
        return {"ok": True, "message": "AD Group already exists", "id": existing.id}
    
    new_group = KnownADGroup(
        ad_group_oid=ad_group_oid,
        display_name=display_name,
        is_manually_added=True
    )
    db.add(new_group)
    db.commit()
    db.refresh(new_group)
    return {"ok": True, "id": new_group.id}
