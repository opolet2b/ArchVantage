from sqlalchemy import Boolean, Column, ForeignKey, Integer, String, DateTime, Table, Enum, JSON
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import enum
from app.core.database import Base

class AuthType(str, enum.Enum):
    INTERNAL = "INTERNAL"
    SSO = "SSO"

class UserRoleSource(str, enum.Enum):
    MANUAL = "MANUAL"
    MAPPED = "MAPPED"

# Association table for User-Role many-to-many relationship
# We need to store extra data (source) so we use a model instead of a raw table
class UserRole(Base):
    __tablename__ = "user_roles"
    
    user_id = Column(Integer, ForeignKey("users.id"), primary_key=True)
    role_id = Column(Integer, ForeignKey("roles.id"), primary_key=True)
    source = Column(Enum(UserRoleSource), default=UserRoleSource.MANUAL)

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True)
    first_name = Column(String)
    last_name = Column(String)
    auth_type = Column(Enum(AuthType), default=AuthType.INTERNAL)
    password_hash = Column(String, nullable=True)
    is_active = Column(Boolean, default=True)
    requires_password_change = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    roles = relationship("Role", secondary="user_roles", back_populates="users")

class Role(Base):
    __tablename__ = "roles"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True)
    description = Column(String)
    # Permissions could be a JSON column or another relationship. 
    # For now, we'll keep it simple or add a permissions column if needed.
    # Permissions stored as a JSON list of strings
    permissions = Column(JSON, default=[]) 

    users = relationship("User", secondary="user_roles", back_populates="roles")
    group_mappings = relationship("GroupMapping", back_populates="role")

class KnownADGroup(Base):
    __tablename__ = "known_ad_groups"

    id = Column(Integer, primary_key=True, index=True)
    ad_group_oid = Column(String, unique=True, index=True) # Object ID from AD
    display_name = Column(String)
    is_manually_added = Column(Boolean, default=False)

    mappings = relationship("GroupMapping", back_populates="ad_group")

class GroupMapping(Base):
    __tablename__ = "group_mappings"

    id = Column(Integer, primary_key=True, index=True)
    ad_group_id = Column(Integer, ForeignKey("known_ad_groups.id"))
    role_id = Column(Integer, ForeignKey("roles.id"))

    ad_group = relationship("KnownADGroup", back_populates="mappings")
    role = relationship("Role", back_populates="group_mappings")
