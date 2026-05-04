from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from typing import List, Optional
from sqlalchemy.orm import Session
import uuid

from app.services.stt_service import stt_service
from app.services.config_service import config_service
from app.core.database import get_db
from app.models.stt import STTConfig
from app.schemas.stt import STTConfig as STTConfigSchema, STTConfigCreate, STTConfigUpdate

router = APIRouter()

# --- Configuration Management ---

@router.get("/configs", response_model=List[STTConfigSchema])
def get_stt_configs(db: Session = Depends(get_db)):
    """List all saved STT configurations."""
    return db.query(STTConfig).all()

from pydantic import BaseModel
class STTTestRequest(BaseModel):
    api_url: str
    api_protocol: str
    api_key: Optional[str] = None

@router.post("/test-connection")
async def test_stt_connection(request: STTTestRequest):
    """Test if an STT endpoint is reachable and responding."""
    url = request.api_url
    
    # Pre-process URL based on protocol to test the final endpoint
    test_url = url
    if request.api_protocol == "OPENAI":
         if not test_url.endswith("/audio/transcriptions") and not test_url.endswith("/transcriptions"):
                test_url = test_url.rstrip("/") + "/v1/audio/transcriptions" if "/v1" not in test_url and "api.openai" not in test_url else test_url.rstrip("/") + "/audio/transcriptions"
    
    headers = {}
    if request.api_key:
        headers["Authorization"] = f"Bearer {request.api_key}"
        
    try:
        import httpx
        async with httpx.AsyncClient(timeout=5.0) as client:
            # We try a simple GET to the base URL to see if it's alive.
            base_url = "/".join(test_url.split("/")[:3]) # e.g. http://localhost:7066
            try:
                response = await client.get(base_url)
                return {"status": "success", "message": f"Successfully reached {base_url} (Status: {response.status_code})"}
            except:
                return {"status": "success", "message": f"Server found at {base_url}, but it didn't respond to a simple test. It may still work for transcription."}
    except Exception as e:
        return {"status": "error", "message": f"Could not reach {url}: {str(e)}"}

@router.post("/configs", response_model=STTConfigSchema)
def create_stt_config(config: STTConfigCreate, db: Session = Depends(get_db)):
    """Create a new STT configuration."""
    # If set as default, unset others
    if config.is_default:
        db.query(STTConfig).update({STTConfig.is_default: False})
    
    db_config = STTConfig(**config.dict())
    db.add(db_config)
    db.commit()
    db.refresh(db_config)
    return db_config

@router.put("/configs/{config_id}", response_model=STTConfigSchema)
def update_stt_config(config_id: int, config_update: STTConfigUpdate, db: Session = Depends(get_db)):
    """Update an existing STT configuration."""
    db_config = db.query(STTConfig).filter(STTConfig.id == config_id).first()
    if not db_config:
        raise HTTPException(status_code=404, detail="Configuration not found")
    
    if config_update.is_default:
        db.query(STTConfig).filter(STTConfig.id != config_id).update({STTConfig.is_default: False})
    
    for key, value in config_update.dict().items():
        setattr(db_config, key, value)
    
    db.commit()
    db.refresh(db_config)
    return db_config

@router.delete("/configs/{config_id}")
def delete_stt_config(config_id: int, db: Session = Depends(get_db)):
    """Delete an STT configuration."""
    db_config = db.query(STTConfig).filter(STTConfig.id == config_id).first()
    if not db_config:
        raise HTTPException(status_code=404, detail="Configuration not found")
    
    db.delete(db_config)
    db.commit()
    return {"status": "success"}


# --- Transcription ---

@router.post("/transcribe")
async def transcribe_audio(
    file: UploadFile = File(...),
    config_id: str = Form(...),
    db: Session = Depends(get_db)
):
    """
    Transcribes audio chunk uploads.
    Supports both legacy presets and new database-backed STT profiles.
    """
    # 1. Try to find in Database first (new system)
    db_config = None
    if config_id.isdigit():
        db_config = db.query(STTConfig).filter(STTConfig.id == int(config_id)).first()
    
    if not db_config:
        # Try by name in DB
        db_config = db.query(STTConfig).filter(STTConfig.name == config_id).first()

    from app.services.debug_service import debug_service
    if db_config:
        debug_service.log("INFO", "Settings", "STT", f"Resolved STT Profile from DB: {db_config.name} (ID: {db_config.id}), Model: {db_config.model_id}")
        if db_config.provider_type == "BROWSER":
            raise HTTPException(status_code=400, detail="Browser STT should be handled locally by the client.")
            
        mock_config = {
            "name": db_config.name,
            "provider_type": db_config.provider_type.lower(),
            "api_endpoint": db_config.api_url,
            "api_key": db_config.api_key,
            "api_protocol": db_config.api_protocol,
            "model_id": db_config.model_id,
            "language_code": db_config.language_code or "en",
            "temperature": 0.0,
            "prompt": None
        }
    else:
        # 2. Fallback to Legacy Presets
        presets = config_service.get_config().get("presets", [])
        preset = next((p for p in presets if p.get("name") == config_id or str(p.get("id", "")) == config_id), None)
        
        if not preset:
            raise HTTPException(status_code=404, detail=f"STT Config '{config_id}' not found in DB or presets")
            
        if preset.get("is_browser_native") == True:
            raise HTTPException(status_code=400, detail="Browser STT should be handled locally by the client.")
            
        mock_config = {
            "name": preset.get("name", "Unknown"),
            "provider_type": preset.get("type") or "remote",
            "api_endpoint": preset.get("api_url"),
            "api_key": preset.get("service_api_key") or preset.get("model_api_key"),
            "model_id": preset.get("model_name"),
            "language_code": preset.get("language_code", "en"),
            "temperature": 0.0,
            "prompt": None
        }
        
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
