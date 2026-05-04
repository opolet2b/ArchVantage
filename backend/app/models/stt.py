from sqlalchemy import Column, Integer, String, Boolean
from app.core.database import Base

class STTConfig(Base):
    """
    Database model for Speech-To-Text configurations.
    Enables dedicated STT engine management decoupled from LLM presets.
    """
    __tablename__ = "stt_configs"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    provider_type = Column(String) # "LOCAL", "REMOTE", "BROWSER"
    model_id = Column(String, nullable=True)
    api_url = Column(String, nullable=True)
    api_key = Column(String, nullable=True)
    api_protocol = Column(String, default="OPENAI") # "OPENAI" or "RAW"
    language_code = Column(String, default="en")
    is_default = Column(Boolean, default=False)
