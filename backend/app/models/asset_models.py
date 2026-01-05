"""
Asset Models

SQLAlchemy models for managed file assets.
Tracks file metadata and physical storage location.

PEP 8 Compliant
"""
import uuid
from datetime import datetime
from sqlalchemy import (
    Column, String, Integer, Float, DateTime, ForeignKey, BigInteger
)
from sqlalchemy.orm import relationship

from app.core.database import Base


def generate_uuid():
    """Generate a UUID string for use as primary key."""
    return str(uuid.uuid4())


class Asset(Base):
    """
    Represents a file uploaded by a user.
    
    The file content is stored on disk (Managed Object Storage),
    and this model tracks the metadata and authorization.
    """
    __tablename__ = "assets"

    id = Column(
        String(36),
        primary_key=True,
        default=generate_uuid
    )
    
    # Ownership - Strict Access Control
    owner_id = Column(
        Integer,
        ForeignKey("users.id"),
        nullable=False,
        index=True
    )
    
    # Metadata
    original_name = Column(String(255), nullable=False)
    mime_type = Column(String(100), nullable=False)
    size_bytes = Column(BigInteger, nullable=False)
    
    # Physical Storage
    # Path relative to the storage root (e.g., "2023/12/21/<uuid>.pdf")
    file_path = Column(String(512), nullable=False)
    
    
    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationships
    # user = relationship("User", back_populates="assets") # Assuming User model has this
