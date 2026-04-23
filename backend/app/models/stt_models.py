from sqlalchemy import Boolean, Column, Integer, String, Enum, DateTime
from sqlalchemy.sql import func
import enum
from app.core.database import Base

class STTProviderType(str, enum.Enum):
    LOCAL = "LOCAL"
    REMOTE = "REMOTE"
    BROWSER = "BROWSER"

class SttConfig(Base):
    __tablename__ = "stt_configs"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True, nullable=False)
    provider_type = Column(Enum(STTProviderType), nullable=False)
    api_endpoint = Column(String, nullable=True)
    api_key = Column(String, nullable=True)
    model_id = Column(String, nullable=True)
    language_code = Column(String, nullable=True, default="en-US")
    is_default = Column(Boolean, default=False)
    temperature = Column(String, nullable=True, default="0.0")  # keeping as string for form simplicity or float
    prompt = Column(String, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
