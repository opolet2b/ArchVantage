"""
Template Models

Database models for the Templates Management Module.
Supports folders, templates, and folder-level permissions.
"""
from sqlalchemy import (
    Column, Integer, String, Text, DateTime, ForeignKey, Enum
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import enum
from uuid import uuid4
from app.core.database import Base


class TemplatePermissionLevel(str, enum.Enum):
    """Permission levels for template folders."""
    READ = "READ"    # Can select and use templates
    WRITE = "WRITE"  # Can create, update, delete templates and folders
    DENY = "DENY"    # Folder is invisible to the user


class TemplateFolder(Base):
    """
    Folder for organizing templates.
    
    Supports hierarchical structure with parent-child relationships.
    """
    __tablename__ = "template_folders"
    
    id = Column(String, primary_key=True, default=lambda: str(uuid4()))
    name = Column(String, nullable=False)
    path = Column(String, nullable=False, unique=True)  # e.g., "/HR/Resumes"
    parent_id = Column(String, ForeignKey("template_folders.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    
    # Relationships
    parent = relationship(
        "TemplateFolder", 
        remote_side=[id], 
        backref="children"
    )
    templates = relationship("Template", back_populates="folder")
    permissions = relationship(
        "TemplatePermission", 
        back_populates="folder",
        cascade="all, delete-orphan"
    )


class Template(Base):
    """
    A markdown template with YAML frontmatter.
    
    Used by the Markdown Generator Node for document restructuring.
    """
    __tablename__ = "templates"
    
    id = Column(String, primary_key=True, default=lambda: str(uuid4()))
    name = Column(String, nullable=False)
    path = Column(String, nullable=False, unique=True)  # e.g., "/HR/Resumes/exec_v1.md"
    content = Column(Text, nullable=True)  # Full markdown with YAML frontmatter
    folder_id = Column(String, ForeignKey("template_folders.id"), nullable=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    last_modified = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    # Relationships
    folder = relationship("TemplateFolder", back_populates="templates")
    creator = relationship("User", foreign_keys=[created_by])


class TemplatePermission(Base):
    """
    Permission assignment for a template folder.
    
    Permissions can be assigned to either a Role or a User.
    Permissions are inherited by child folders unless explicitly overridden.
    """
    __tablename__ = "template_permissions"
    
    id = Column(Integer, primary_key=True)
    folder_id = Column(String, ForeignKey("template_folders.id"), nullable=False)
    role_id = Column(Integer, ForeignKey("roles.id"), nullable=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    permission = Column(
        Enum(TemplatePermissionLevel), 
        default=TemplatePermissionLevel.READ
    )
    
    # Relationships
    folder = relationship("TemplateFolder", back_populates="permissions")
    role = relationship("Role")
    user = relationship("User")
