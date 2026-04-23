from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session
from typing import List, Optional
from pydantic import BaseModel
import uuid

from app.core.database import get_db
from app.models.stt_models import SttConfig, STTProviderType
from app.services.stt_service import stt_service

router = APIRouter()

class SttConfigCreate(BaseModel):
    name: str
    provider_type: STTProviderType
    api_endpoint: Optional[str] = None
    api_key: Optional[str] = None
    model_id: Optional[str] = None
    language_code: Optional[str] = "en-US"
    is_default: Optional[bool] = False
    temperature: Optional[str] = "0.0"
    prompt: Optional[str] = None

class SttConfigResponse(SttConfigCreate):
    id: int

    class Config:
        from_attributes = True

@router.get("/configs", response_model=List[SttConfigResponse])
def get_stt_configs(db: Session = Depends(get_db)):
    return db.query(SttConfig).all()

@router.post("/configs", response_model=SttConfigResponse)
def create_stt_config(config: SttConfigCreate, db: Session = Depends(get_db)):
    if config.is_default:
        # Turn off other defaults
        db.query(SttConfig).update({SttConfig.is_default: False})
        
    db_config = SttConfig(**config.dict())
    db.add(db_config)
    db.commit()
    db.refresh(db_config)
    return db_config

@router.put("/configs/{config_id}", response_model=SttConfigResponse)
def update_stt_config(config_id: int, config: SttConfigCreate, db: Session = Depends(get_db)):
    db_config = db.query(SttConfig).filter(SttConfig.id == config_id).first()
    if not db_config:
        raise HTTPException(status_code=404, detail="Config not found")
        
    if config.is_default:
        db.query(SttConfig).update({SttConfig.is_default: False})
        
    for var, value in config.dict().items():
        setattr(db_config, var, value)
        
    db.commit()
    db.refresh(db_config)
    return db_config

@router.delete("/configs/{config_id}")
def delete_stt_config(config_id: int, db: Session = Depends(get_db)):
    db_config = db.query(SttConfig).filter(SttConfig.id == config_id).first()
    if not db_config:
        raise HTTPException(status_code=404, detail="Config not found")
        
    db.delete(db_config)
    db.commit()
    return {"ok": True}

@router.post("/transcribe")
async def transcribe_audio(
    file: UploadFile = File(...),
    config_id: str = Form(...)
):
    """
    Transcribes audio chunk uploads.
    Used for server-side processing of STT dictates.
    """
    from app.services.config_service import config_service
    
    presets = config_service.get_config().get("presets", [])
    preset = next((p for p in presets if p.get("name") == config_id or str(p.get("id", "")) == config_id), None)
    
    if not preset:
        raise HTTPException(status_code=404, detail="STT Config not found in presets")
        
    if preset.get("is_browser_native") == True:
        raise HTTPException(status_code=400, detail="Browser STT should be handled locally by the client.")
        
    mock_config = SttConfig(
        name=preset.get("name", "Unknown"),
        provider_type=STTProviderType.LOCAL if preset.get("type") == "local" else STTProviderType.REMOTE,
        api_endpoint=preset.get("api_url"),
        api_key=preset.get("service_api_key") or preset.get("model_api_key"),
        model_id=preset.get("model_name"),
        language_code="en-US",
        temperature="0.0",
        prompt=None
    )
        
    audio_data = await file.read()
    if not audio_data:
        raise HTTPException(status_code=400, detail="Empty audio file")
        
    filename = file.filename or f"audio_{uuid.uuid4().hex}.webm"
    
    try:
        text = await stt_service.transcribe_audio(audio_data, filename, mock_config)
        return {"text": text}
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Transcription failed: {str(e)}")
