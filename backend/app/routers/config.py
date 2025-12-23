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
    is_vision: Optional[bool] = False

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

class DefaultsRequest(BaseModel):
    default_llm: Optional[str] = None
    default_vision: Optional[str] = None

@router.get("/config/defaults")
def get_defaults():
    llm_preset = config_service.get_default_llm_preset()
    vision_preset = config_service.get_default_vision_preset()
    return {
        "default_llm": llm_preset["name"] if llm_preset else None,
        "default_vision": vision_preset["name"] if vision_preset else None
    }

@router.post("/config/defaults")
def set_defaults(request: DefaultsRequest):
    if request.default_llm:
        config_service.set_default_llm_preset(request.default_llm)
    if request.default_vision:
        config_service.set_default_vision_preset(request.default_vision)
    return {"status": "success"}

# Keep old endpoint for temporary frontend compatibility if needed, 
# but we will update frontend immediately.
@router.get("/config/active")
def get_active_preset():
    # Return the LLM default as the "active" one for legacy calls
    preset = config_service.get_default_llm_preset()
    return {"active_preset": preset}
