from pydantic import BaseModel
from typing import Optional

class STTConfigBase(BaseModel):
    name: str
    provider_type: str # "LOCAL", "REMOTE", "BROWSER"
    model_id: Optional[str] = None
    api_url: Optional[str] = None
    api_key: Optional[str] = None
    api_protocol: str = "OPENAI" # "OPENAI", "RAW"
    language_code: str = "en"
    is_default: bool = False

class STTConfigCreate(STTConfigBase):
    pass

class STTConfigUpdate(STTConfigBase):
    pass

class STTConfig(STTConfigBase):
    id: int

    class Config:
        from_attributes = True
