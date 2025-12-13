from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Dict, Any, List, Optional
from app.services.config_service import config_service

router = APIRouter(tags=["config"])

class ConfigRequest(BaseModel):
    name: str
    type: str  # "local" or "remote"
    model_name: Optional[str] = None
    api_url: Optional[str] = None
    service_api_key: Optional[str] = None
    model_api_key: Optional[str] = None

@router.get("/config/models")
async def get_models():
    models = await config_service.get_ollama_models()
    return {"models": models}

@router.get("/config/presets")
def get_presets():
    config = config_service.get_config()
    return {"presets": config.get("presets", [])}

@router.post("/config/presets")
def save_preset(preset: ConfigRequest):
    config = config_service.get_config()
    presets = config.get("presets", [])
    
    # Update existing or add new
    existing_index = next((index for (index, d) in enumerate(presets) if d["name"] == preset.name), None)
    
    preset_dict = preset.dict()
    if existing_index is not None:
        presets[existing_index] = preset_dict
    else:
        presets.append(preset_dict)
    
    config["presets"] = presets
    config_service.save_config(config)
    return {"status": "success", "preset": preset_dict}

class ActivePresetRequest(BaseModel):
    name: str

@router.get("/config/active")
def get_active_preset():
    preset = config_service.get_active_preset()
    return {"active_preset": preset}

@router.post("/config/active")
def set_active_preset(request: ActivePresetRequest):
    config_service.set_active_preset(request.name)
    return {"status": "success", "active_preset": request.name}
