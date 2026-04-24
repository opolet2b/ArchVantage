from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from typing import List, Optional
from pydantic import BaseModel
import uuid

from app.services.stt_service import stt_service
from app.services.config_service import config_service

router = APIRouter()

@router.post("/transcribe")
async def transcribe_audio(
    file: UploadFile = File(...),
    config_id: str = Form(...)
):
    """
    Transcribes audio chunk uploads.
    Used for server-side processing of STT dictates.
    """
    presets = config_service.get_config().get("presets", [])
    preset = next((p for p in presets if p.get("name") == config_id or str(p.get("id", "")) == config_id), None)
    
    if not preset:
        raise HTTPException(status_code=404, detail="STT Config not found in presets")
        
    if preset.get("is_browser_native") == True:
        raise HTTPException(status_code=400, detail="Browser STT should be handled locally by the client.")
        
    # Construct config dict for service
    mock_config = {
        "name": preset.get("name", "Unknown"),
        "provider_type": preset.get("type", "remote"),
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
