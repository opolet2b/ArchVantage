"""
Prompt Management Models

Defines the database schema for the Prompt Management System.
- PromptRegistry: Read-only definitions synced from code.
- PromptOverride: User or Admin customizations.
"""
from sqlalchemy import Column, String, Integer, Text, Boolean, JSON, ForeignKey, DateTime
from sqlalchemy.sql import func
from app.core.database import Base

class PromptRegistry(Base):
    """
    Registry of all available prompts defined in the codebase.
    Acts as the 'Source of Truth' for what prompts exist and their contracts.
    
    This table is populated/updated automatically on application startup.
    """
    __tablename__ = "prompt_registry"

    key = Column(String, primary_key=True, index=True, doc="Unique dot-notation key (e.g. 'agent.architect.system')")
    group = Column(String, index=True, doc="Logical grouping (e.g. 'System', 'Tools')")
    default_content = Column(Text, nullable=False, doc="The factory default prompt text (f-string format)")
    variables_schema = Column(JSON, default=dict, doc="JSON schema describing available variables")
    access_level = Column(String, default="read_only", doc="Permission level: 'read_only', 'admin_only', 'user_overridable'")
    description = Column(Text, nullable=True, doc="Human readable description of the prompt's purpose")
    last_synced_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class PromptOverride(Base):
    """
    Runtime overrides for prompts.
    
    If a record exists here, the system uses 'content' (Jinja2) instead of 
    registry.default_content (f-string).
    """
    __tablename__ = "prompt_overrides"

    id = Column(Integer, primary_key=True, index=True)
    prompt_key = Column(String, ForeignKey("prompt_registry.key", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True, doc="NULL for Global Admin Override")
    
    content = Column(Text, nullable=False, doc="The custom prompt text (Jinja2 format)")
    is_active = Column(Boolean, default=True, doc="Soft toggle to enable/disable this override")
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
