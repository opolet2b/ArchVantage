from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Response
import csv
import io
import secrets
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.core.database import get_db
from app.core.security import get_password_hash
from app.models.user import User, Role, UserRole, UserRoleSource, AuthType, KnownADGroup
from app.schemas.user import User as UserSchema, UserCreate, UserUpdate
from app.routers.auth import get_current_admin_user, get_current_active_user, PermissionChecker

router = APIRouter()

@router.get("/users", response_model=List[UserSchema])
def read_users(
    skip: int = 0, 
    limit: int = 100, 
    active_only: Optional[bool] = None,
    inactive_only: Optional[bool] = None,
    no_roles_only: Optional[bool] = None,
    auth_type: Optional[str] = None,
    db: Session = Depends(get_db), 
    current_user: User = Depends(get_current_active_user)
):
    query = db.query(User)
    
    # Filter by active status
    if active_only:
        query = query.filter(User.is_active == True)
    elif inactive_only:
        query = query.filter(User.is_active == False)
    
    # Filter by auth type
    if auth_type:
        try:
            auth_type_enum = AuthType(auth_type.upper())
            query = query.filter(User.auth_type == auth_type_enum)
        except ValueError:
            pass  # Invalid auth type, ignore filter
    
    users = query.offset(skip).limit(limit).all()
    
    # Filter by no roles (post-query since it's a relationship)
    if no_roles_only:
        users = [user for user in users if len(user.roles) == 0]
    
    return users

@router.get("/users/{user_id}")
def get_user_details(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker("user:manage"))
):
    """Get detailed user information including role sources"""
    db_user = db.query(User).filter(User.id == user_id).first()
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Get roles with their sources
    user_roles = db.query(UserRole).filter(UserRole.user_id == user_id).all()
    roles_with_source = []
    for ur in user_roles:
        role = db.query(Role).filter(Role.id == ur.role_id).first()
        if role:
            roles_with_source.append({
                "id": role.id,
                "name": role.name,
                "description": role.description,
                "source": ur.source.value
            })
    
    return {
        "id": db_user.id,
        "email": db_user.email,
        "first_name": db_user.first_name,
        "last_name": db_user.last_name,
        "auth_type": db_user.auth_type.value,
        "is_active": db_user.is_active,
        "roles": roles_with_source,
        "created_at": db_user.created_at,
        "updated_at": db_user.updated_at
    }

@router.post("/users", response_model=UserSchema)
def create_user(
    user: UserCreate, 
    db: Session = Depends(get_db), 
    current_user: User = Depends(PermissionChecker("user:manage"))
):
    db_user = db.query(User).filter(User.email == user.email).first()
    if db_user:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    hashed_password = get_password_hash(user.password)
    db_user = User(
        email=user.email, 
        first_name=user.first_name, 
        last_name=user.last_name,
        password_hash=hashed_password,
        auth_type=AuthType.INTERNAL,
        is_active=user.is_active
    )
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    
    # Assign roles
    if user.role_ids:
        for role_id in user.role_ids:
            role = db.query(Role).filter(Role.id == role_id).first()
            if role:
                # We need to manually create UserRole to set source=MANUAL
                user_role = UserRole(user_id=db_user.id, role_id=role.id, source=UserRoleSource.MANUAL)
                db.add(user_role)
        db.commit()
        db.refresh(db_user)
        
    return db_user

@router.put("/users/{user_id}", response_model=UserSchema)
def update_user(
    user_id: int, 
    user_update: UserUpdate, 
    db: Session = Depends(get_db), 
    current_user: User = Depends(PermissionChecker("user:manage"))
):
    db_user = db.query(User).filter(User.id == user_id).first()
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")
    
    update_data = user_update.dict(exclude_unset=True)
    
    # Handle password update
    if "password" in update_data and update_data["password"]:
        update_data["password_hash"] = get_password_hash(update_data.pop("password"))
    
    # Handle roles update
    if "role_ids" in update_data:
        role_ids = update_data.pop("role_ids")
        # Remove existing manual roles
        db.query(UserRole).filter(
            UserRole.user_id == user_id, 
            UserRole.source == UserRoleSource.MANUAL
        ).delete()
        
        # Add new roles
        for role_id in role_ids:
            role = db.query(Role).filter(Role.id == role_id).first()
            if role:
                # Check if mapping already exists (e.g. from group mapping), if so, we might have a conflict or duplicate
                # For simplicity, we just add as MANUAL. 
                # If a user has both MAPPED and MANUAL for the same role, it's fine, they have the role.
                # But to avoid PK constraint error if (user_id, role_id) is PK, we should check existence.
                existing = db.query(UserRole).filter(UserRole.user_id == user_id, UserRole.role_id == role_id).first()
                if existing:
                    existing.source = UserRoleSource.MANUAL # Upgrade to manual so it sticks?
                else:
                    user_role = UserRole(user_id=user_id, role_id=role_id, source=UserRoleSource.MANUAL)
                    db.add(user_role)
    
    for key, value in update_data.items():
        setattr(db_user, key, value)
        
    db.commit()
    db.refresh(db_user)
    return db_user

@router.put("/users/{user_id}/toggle-active", response_model=UserSchema)
def toggle_user_active(
    user_id: int, 
    db: Session = Depends(get_db), 
    current_user: User = Depends(PermissionChecker("user:manage"))
):
    db_user = db.query(User).filter(User.id == user_id).first()
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")
    
    db_user.is_active = not db_user.is_active
    db.commit()
    db.refresh(db_user)
    return db_user

@router.post("/users/bulk-upload")
def bulk_upload_users(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker("user:manage"))
):
    if not file.filename.endswith('.csv'):
        raise HTTPException(status_code=400, detail="Only CSV files are allowed")

    content = file.file.read()
    try:
        decoded = content.decode('utf-8-sig')
    except UnicodeDecodeError:
        decoded = content.decode('latin-1') # fallback
        
    try:
        # Detect the dialect (handles both comma and semicolon)
        dialect = csv.Sniffer().sniff(decoded[:1024])
    except csv.Error:
        # Fallback if sniffing fails
        csv.register_dialect('fallback', delimiter=',')
        dialect = 'fallback'

    csv_reader = csv.DictReader(io.StringIO(decoded), dialect=dialect)
    
    # We will generate a CSV response with temporary passwords
    output = io.StringIO()
    csv_writer = csv.writer(output)
    csv_writer.writerow(['Email', 'Role', 'Temporary Password', 'Status'])

    fieldnames = [field.strip().lower() for field in (csv_reader.fieldnames or [])]
    csv_reader.fieldnames = fieldnames
    
    if 'email' not in fieldnames:
        raise HTTPException(status_code=400, detail="CSV must contain an 'Email' column (and optionally a 'Role' column)")

    for row in csv_reader:
        email = row.get('email', '').strip()
        role_name = row.get('role', '').strip()
        
        if not email or '@' not in email:
            continue

        assigned_role_name = ''
        role_obj = None
        if role_name:
            role_obj = db.query(Role).filter(func.lower(Role.name) == role_name.lower()).first()
            if role_obj:
                assigned_role_name = role_obj.name
            else:
                assigned_role_name = f"{role_name} (Not Found)"
            
        # Check if user exists
        existing = db.query(User).filter(User.email == email).first()
        if existing:
            status = 'Already Exists'
            if role_obj:
                # Assign role if not already assigned
                existing_role = db.query(UserRole).filter(UserRole.user_id == existing.id, UserRole.role_id == role_obj.id).first()
                if not existing_role:
                    user_role = UserRole(user_id=existing.id, role_id=role_obj.id, source=UserRoleSource.MANUAL)
                    db.add(user_role)
                    status = 'Already Exists - Role Assigned'
                else:
                    status = 'Already Exists - Role Already Had'
            csv_writer.writerow([email, assigned_role_name, '', status])
            continue
            
        temp_password = secrets.token_urlsafe(8)
        hashed_password = get_password_hash(temp_password)
        
        # User username is usually email or we derive first/last from email if missing
        first_name = email.split('@')[0]
        last_name = ''
        
        db_user = User(
            email=email,
            first_name=first_name,
            last_name=last_name,
            password_hash=hashed_password,
            auth_type=AuthType.INTERNAL,
            is_active=True,
            requires_password_change=True
        )
        db.add(db_user)
        db.flush() # get user id
        
        if role_obj:
            user_role = UserRole(user_id=db_user.id, role_id=role_obj.id, source=UserRoleSource.MANUAL)
            db.add(user_role)
                
        csv_writer.writerow([email, assigned_role_name, temp_password, 'Created'])
        
    db.commit()
    
    return Response(
        content=output.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=users_created.csv"}
    )

@router.get("/ad-groups")
def get_ad_groups(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker("user:manage"))
):
    """Get all known AD groups"""
    ad_groups = db.query(KnownADGroup).offset(skip).limit(limit).all()
    return [{
        "id": group.id,
        "display_name": group.display_name,
        "ad_group_oid": group.ad_group_oid,
        "is_manually_added": group.is_manually_added
    } for group in ad_groups]

