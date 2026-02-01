"""
Scenario Models

Models for the Scenarios feature which allows defining vertical modes for the application.

PEP 8 Compliant
"""
import uuid
from datetime import datetime
from sqlalchemy import (
    Column, String, Text, JSON, DateTime, Integer, ForeignKey, Boolean
)
from sqlalchemy.orm import relationship

from app.core.database import Base

def generate_uuid():
    """Generate a UUID string for use as primary key."""
    return str(uuid.uuid4())

class Scenario(Base):
    """
    A Scenario defines a vertical mode for the Semantic Workbench.
    It includes configuration for UI overrides, domain structures,
    automations, and default content.
    """
    __tablename__ = "scenarios"

    id = Column(
        String(36),
        primary_key=True,
        default=generate_uuid
    )
    
    # Metadata
    name = Column(String(255), nullable=False, unique=True)
    description = Column(Text, nullable=True)
    icon = Column(String(50), nullable=True) # Iconify icon name
    theme_color = Column(String(20), nullable=True) # Hex color
    
    # System Flags
    is_default = Column(Boolean, default=False)
    is_system = Column(Boolean, default=False)  # Immutable if True
    
    # Full JSON configuration
    # Includes:
    # - ui_overrides (toolbox, sidebar, terminology)
    # - domain_definitions (presets)
    # - agent_config (system prompts)
    # - initialization (master canvas layout)
    # - automations (triggers)
    configuration = Column(JSON, nullable=False, default={})
    
    # Access Control (Optional, broadly available by default)
    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    
    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, onupdate=datetime.utcnow)
    
    # Relationships
    creator = relationship("User", backref="created_scenarios")
