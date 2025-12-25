"""
Prompt Schemas

Pydantic models for the Prompt Management System.
"""
from pydantic import BaseModel, Field
from typing import Dict, Literal, Optional
from datetime import datetime

class PromptDefinition(BaseModel):
    """
    Definition of a prompt in the codebase.
    Used by the PromptRegistryService to sync code to DB.
    """
    key: str = Field(..., description="Unique dot-notation key (e.g. 'agent.architect.system')")
    group: str = Field(..., description="Logical grouping (e.g. 'System', 'Tools')")
    default_text: str = Field(..., description="The factory default prompt text (f-string format)")
    variables: Dict[str, str] = Field(default_factory=dict, description="Map of variable_name -> description")
    access_level: Literal["read_only", "admin_only", "user_overridable"] = Field(
        default="read_only", 
        description="Who can modify this prompt"
    )
    description: Optional[str] = Field(None, description="Human readable purpose")

class PromptOverrideCreate(BaseModel):
    """Schema for creating/updating an override via API."""
    content: str = Field(..., description="The custom Jinja2 template")
    explanation: Optional[str] = Field(None, description="Reason for the override (audit trail)")

class PromptResponse(BaseModel):
    """Detailed response for API and UI."""
    key: str
    group: str
    description: Optional[str]
    default_content: str
    variables_schema: Dict[str, str]
    access_level: str
    last_synced_at: Optional[datetime]
    
    # Override status
    active_override: Optional[str] = Field(None, description="The content currently being used (if different from default)")
    is_overridden: bool = False
    
    class Config:
        from_attributes = True
