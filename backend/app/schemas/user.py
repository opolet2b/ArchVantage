from typing import List, Optional
from pydantic import BaseModel, EmailStr
from datetime import datetime
from app.models.user import AuthType

class RoleBase(BaseModel):
    name: str
    description: Optional[str] = None
    permissions: List[str] = []

class RoleCreate(RoleBase):
    pass

class Role(RoleBase):
    id: int
    
    class Config:
        from_attributes = True

class UserBase(BaseModel):
    email: EmailStr
    first_name: str
    last_name: str
    is_active: Optional[bool] = True
    requires_password_change: Optional[bool] = False

class UserCreate(UserBase):
    password: str
    role_ids: List[int] = []

class UserUpdate(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    email: Optional[EmailStr] = None
    password: Optional[str] = None
    is_active: Optional[bool] = None
    role_ids: Optional[List[int]] = None

class User(UserBase):
    id: int
    auth_type: AuthType
    roles: List[Role] = []
    created_at: Optional[datetime]
    updated_at: Optional[datetime]

    class Config:
        from_attributes = True

class Token(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    email: Optional[str] = None
    roles: List[str] = []
    permissions: List[str] = []
    requires_password_change: Optional[bool] = False

class KnownADGroupBase(BaseModel):
    ad_group_oid: str
    display_name: str

class KnownADGroup(KnownADGroupBase):
    id: int
    is_manually_added: bool
    
    class Config:
        from_attributes = True

class GroupMappingCreate(BaseModel):
    ad_group_id: int
    role_id: int
