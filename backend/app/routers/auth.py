from datetime import timedelta
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.security import verify_password, create_access_token, ACCESS_TOKEN_EXPIRE_MINUTES, decode_access_token
from app.models.user import User
from app.schemas.user import Token, TokenData

router = APIRouter()

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/token")

def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    # print(f"[DEBUG-AUTH] Validating token: {token[:10]}..." if token else "[DEBUG-AUTH] No token received")
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    payload = decode_access_token(token)
    if payload is None:
        raise credentials_exception
    email: str = payload.get("sub")
    if email is None:
        raise credentials_exception
    token_data = TokenData(email=email)
    user = db.query(User).filter(User.email == token_data.email).first()
    if user is None:
        raise credentials_exception
    return user

def get_current_active_user(current_user: User = Depends(get_current_user)):
    if not current_user.is_active:
        raise HTTPException(status_code=400, detail="Inactive user")
    return current_user

def get_current_admin_user(current_user: User = Depends(get_current_active_user)):
    is_admin = any(role.name == "Admin" for role in current_user.roles)
    if not is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="The user doesn't have enough privileges"
        )
    return current_user

class PermissionChecker:
    def __init__(self, required_permission: str):
        self.required_permission = required_permission

    def __call__(self, user: User = Depends(get_current_active_user)):
        # Admin always has access
        for role in user.roles:
            if role.name == "Admin":
                return user
            # Check permissions in role
            if role.permissions and self.required_permission in role.permissions:
                return user
        
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Operation not permitted. Required: {self.required_permission}"
        )

@router.post("/auth/token", response_model=Token)
async def login_for_access_token(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    print(f"[DEBUG-AUTH] Login attempt for: {form_data.username}")
    user = db.query(User).filter(User.email == form_data.username).first()
    if user:
        print(f"[DEBUG-AUTH] User found. ID: {user.id}")
        is_valid = verify_password(form_data.password, user.password_hash)
        print(f"[DEBUG-AUTH] Password valid: {is_valid}")
    else:
        print(f"[DEBUG-AUTH] User not found for email: {form_data.username}")
        # Print all users to see what's in the DB
        all_users = db.query(User).all()
        print(f"[DEBUG-AUTH] All users in DB: {[u.email for u in all_users]}")
        
    if not user or not verify_password(form_data.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if not user.is_active:
        raise HTTPException(status_code=400, detail="Inactive user")
        
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.email}, expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer"}

@router.get("/auth/me", response_model=TokenData)
async def read_users_me(current_user: User = Depends(get_current_active_user)):
    roles = [role.name for role in current_user.roles]
    permissions = set()
    for role in current_user.roles:
        if role.permissions:
            permissions.update(role.permissions)
        if role.name == "Admin":
            permissions.add("ADMIN") # Implicit admin permission
            
    return TokenData(email=current_user.email, roles=roles, permissions=list(permissions))
