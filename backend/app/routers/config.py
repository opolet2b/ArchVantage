from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Dict, Any, List, Optional
from app.services.config_service import config_service
from app.core.env_manager import env_manager
from sqlalchemy import create_engine
from sqlalchemy.exc import OperationalError

router = APIRouter(tags=["config"])

class ConfigRequest(BaseModel):
    name: str
    type: str  # "local" or "remote"
    model_name: Optional[str] = None
    api_url: Optional[str] = None
    service_api_key: Optional[str] = None
    model_api_key: Optional[str] = None
    is_vision: Optional[bool] = False
    is_sequential: Optional[bool] = False # New flag for local models
    context_window: Optional[int] = 4096 # Default context window

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

class DatabaseConfigRequest(BaseModel):
    url: str

@router.get("/config/database")
def get_database_config():
    """Get current database configuration."""
    url = env_manager.get_env_value("DATABASE_URL", "sqlite:///./db/sql_app.db")
    return {"url": url}

@router.post("/config/database")
def set_database_config(request: DatabaseConfigRequest):
    """Update database configuration in .env file."""
    env_manager.set_env_value("DATABASE_URL", request.url)
    return {
        "status": "success", 
        "message": "Configuration saved. Please restart the backend for changes to take effect.",
        "restart_required": True
    }

@router.post("/config/database/test")
def test_database_connection(request: DatabaseConfigRequest):
    """Test connection to the provided database URL."""
    try:
        # Create a temporary engine
        connect_args = {}
        if request.url.startswith("sqlite"):
            connect_args = {"check_same_thread": False}
            
        engine = create_engine(request.url, connect_args=connect_args)
        
        # Try to connect
        with engine.connect() as connection:
            pass
            
        return {"status": "success", "message": "Connection successful!"}
    except Exception as e:
        return {"status": "error", "message": str(e)}

class RagConfigRequest(BaseModel):
    embedding_provider: str = "ollama"  # "ollama", "openai", "huggingface"
    embedding_model: str = "nomic-embed-text" 
    embedding_api_key: Optional[str] = None
    parsing_strategy: str = "recursive"  # "recursive", "window", "hierarchical"
    chunk_size: int = 1000
    chunk_overlap: int = 200
    enable_metadata: bool = False # Toggle Title/Summary extraction

@router.get("/config/rag")
def get_rag_config():
    config = config_service.get_config()
    rag_config = config.get("rag_config", {
        "embedding_provider": "ollama",
        "embedding_model": "nomic-embed-text",
        "parsing_strategy": "recursive",
        "chunk_size": 1000,
        "chunk_overlap": 200,
        "enable_metadata": False
    })
    return {"config": rag_config}

@router.post("/config/rag")
def save_rag_config(request: RagConfigRequest):
    config = config_service.get_config()
    config["rag_config"] = request.dict()
    config_service.save_config(config)
    return {"status": "success", "config": request.dict(), "warning": "Requires Re-indexing for changes to take effect."}
