from fastapi import APIRouter, Depends, HTTPException, Body
from fastapi.responses import Response
from typing import List, Optional
from pydantic import BaseModel

from app.services.tts_service import tts_service
from app.services.config_service import config_service

router = APIRouter()

class GenerateSpeechRequest(BaseModel):
    text: str
    config_name: Optional[str] = None

@router.post("/generate")
async def generate_speech(
    request: GenerateSpeechRequest
):
    try:
        # Resolve config
        config = None
        if request.config_name:
            presets = config_service.get_config().get("presets", [])
            config = next((p for p in presets if p["name"] == request.config_name), None)
        
        if not config:
            config = config_service.get_default_tts_preset()
            
        if not config:
            raise HTTPException(status_code=400, detail="No TTS configuration found or specified")

        audio_data = await tts_service.generate_speech(request.text, config)
        if not audio_data:
            raise HTTPException(status_code=500, detail="Speech generation failed to produce audio data")
            
        # Determine media type (OpenAI uses mp3 by default, Gemini usually wav/pcm)
        media_type = "audio/wav"
        if config.get("model_name") == "tts-1":
            media_type = "audio/mpeg"
            
        return Response(content=audio_data, media_type=media_type)
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
