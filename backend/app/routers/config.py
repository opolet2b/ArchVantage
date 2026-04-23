from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Dict, Any, List, Optional
from app.services.config_service import config_service
from app.core.env_manager import env_manager
from sqlalchemy import create_engine
from sqlalchemy.exc import OperationalError
from app.services.debug_service import debug_service

router = APIRouter(tags=["config"])

class ConfigRequest(BaseModel):
    name: str
    type: str  # "local" or "remote"
    model_name: Optional[str] = None
    api_url: Optional[str] = None
    service_api_key: Optional[str] = None
    model_api_key: Optional[str] = None
    is_vision: Optional[bool] = False
    is_embedding: Optional[bool] = False # New flag for embedding models
    is_speech: Optional[bool] = False # New flag for STT models
    is_browser_native: Optional[bool] = False # Flag for browser native stt
    is_sequential: Optional[bool] = False # New flag for local models
    context_window: Optional[int] = 4096 # Default context window

@router.get("/config/models")
async def get_models():
    models = await config_service.get_ollama_models()
    return {"models": models}

@router.get("/config/presets")
def get_presets():
    print("[ConfigRouter] Fetching LLM presets...")
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
    debug_service.log("INFO", "Settings", "Presets", f"Saved preset: {preset.name}")
    return {"status": "success", "preset": preset_dict}

@router.delete("/config/presets/{preset_name}")
def delete_preset(preset_name: str):
    success = config_service.delete_preset(preset_name)
    if success:
        return {"status": "success", "message": f"Preset '{preset_name}' deleted."}
    raise HTTPException(status_code=404, detail="Preset not found")

class DefaultsRequest(BaseModel):
    default_llm: Optional[str] = None
    default_vision: Optional[str] = None
    default_embedding: Optional[str] = None
    default_speech: Optional[str] = None
    reset_db: bool = False

@router.get("/config/defaults")
def get_defaults():
    print("[ConfigRouter] Fetching default configurations...")
    llm_preset = config_service.get_default_llm_preset()
    vision_preset = config_service.get_default_vision_preset()
    embedding_preset = config_service.get_default_embedding_preset()
    speech_preset = config_service.get_default_speech_preset()
    return {
        "default_llm": llm_preset["name"] if llm_preset else None,
        "default_vision": vision_preset["name"] if vision_preset else None,
        "default_embedding": embedding_preset["name"] if embedding_preset else None,
        "default_speech": speech_preset["name"] if speech_preset else None
    }

@router.post("/config/defaults")
def set_defaults(request: DefaultsRequest):
    if request.default_llm:
        config_service.set_default_llm_preset(request.default_llm)
    if request.default_vision:
        config_service.set_default_vision_preset(request.default_vision)
    if request.default_speech:
        config_service.set_default_speech_preset(request.default_speech)
    
    if request.default_embedding:
        # Save default preference
        config_service.set_default_embedding_preset(request.default_embedding)
        
        # Trigger RAG update
        # We need to fetch the preset object to pass it? Or just the name? 
        # RAG service might need the full object.
        # Let's let RAG service resolve the name using config_service.
        try:
             rag_service.update_embedding_model(request.default_embedding, request.reset_db)
        except Exception as e:
            print(f"Error updating embedding model: {e}")
            
    return {"status": "success"}

# Keep old endpoint for temporary frontend compatibility if needed, 
# but we will update frontend immediately.
@router.get("/config/active")
def get_active_preset():
    # Return the LLM default as the "active" one for legacy calls
    preset = config_service.get_default_llm_preset()
    return {"active_preset": preset}

class DatabaseConfigRequest(BaseModel):
    url: Optional[str] = None
    arcadedb_host: Optional[str] = None
    arcadedb_user: Optional[str] = None
    arcadedb_password: Optional[str] = None
    arcadedb_database: Optional[str] = None
    target: Optional[str] = "all"

@router.get("/config/database")
def get_database_config():
    """Get current database configuration."""
    url = env_manager.get_env_value("DATABASE_URL", "sqlite:///./db/sql_app.db")
    arcadedb_host = env_manager.get_env_value("ARCADEDB_HOST", "http://localhost:2480")
    arcadedb_user = env_manager.get_env_value("ARCADEDB_USER", "root")
    arcadedb_password = env_manager.get_env_value("ARCADEDB_PASSWORD", "playwithdata")
    arcadedb_database = env_manager.get_env_value("ARCADEDB_DATABASE", "knowledge_graph")
    return {
        "url": url,
        "arcadedb_host": arcadedb_host,
        "arcadedb_user": arcadedb_user,
        "arcadedb_password": arcadedb_password,
        "arcadedb_database": arcadedb_database
    }

@router.post("/config/database")
def set_database_config(request: DatabaseConfigRequest):
    """Update database configuration in .env file."""
    if request.url is not None:
        env_manager.set_env_value("DATABASE_URL", request.url)
    if request.arcadedb_host is not None:
        env_manager.set_env_value("ARCADEDB_HOST", request.arcadedb_host)
    if request.arcadedb_user is not None:
        env_manager.set_env_value("ARCADEDB_USER", request.arcadedb_user)
    if request.arcadedb_password is not None:
        env_manager.set_env_value("ARCADEDB_PASSWORD", request.arcadedb_password)
    if request.arcadedb_database is not None:
        env_manager.set_env_value("ARCADEDB_DATABASE", request.arcadedb_database)
    return {
        "status": "success", 
        "message": "Configuration saved. Please restart the backend for changes to take effect.",
        "restart_required": True
    }
    debug_service.log("WARNING", "Settings", "Database", "Database configuration updated. Restart required.")

@router.post("/config/database/test")
def test_database_connection(request: DatabaseConfigRequest):
    """Test connection to the provided database URLs (SQL and ArcadeDB)."""
    results = {}
    
    # 1. Test SQL Database
    if request.target in ["all", "sql"] and request.url:
        try:
            connect_args = {}
            if request.url.startswith("sqlite"):
                connect_args = {"check_same_thread": False}
                
            engine = create_engine(request.url, connect_args=connect_args)
            with engine.connect() as connection:
                pass
            results["sql"] = "success"
        except Exception as e:
            results["sql"] = str(e)

    # 2. Test ArcadeDB
    if request.target in ["all", "arcadedb"] and request.arcadedb_host:
        try:
            import httpx
            host = request.arcadedb_host or "http://localhost:2480"
            user = request.arcadedb_user or "root"
            password = request.arcadedb_password or "playwithdata"
            
            # Test endpoint: fetching the server info
            # This ensures we have connectivity without requiring the specific DB to exist yet.
            url = f"{host.rstrip('/')}/api/v1/server"
            
            with httpx.Client(auth=(user, password)) as client:
                response = client.get(url, timeout=5.0)
                response.raise_for_status()
                
            results["arcadedb"] = "success"
        except Exception as e:
            results["arcadedb"] = str(e)

    # Compile final status
    if request.target == "sql":
        if results.get("sql") == "success":
            return {"status": "success", "message": "SQL Connection successful!"}
        else:
            return {"status": "error", "message": f"SQL Connection failed: {results.get('sql', 'No URL provided')}"}

    elif request.target == "arcadedb":
        if results.get("arcadedb") == "success":
            return {"status": "success", "message": "ArcadeDB Connection successful!"}
        else:
            return {"status": "error", "message": f"ArcadeDB Connection failed: {results.get('arcadedb', 'Missing parameters')}"}

    else:
        if results.get("sql") == "success" and results.get("arcadedb") == "success":
            return {"status": "success", "message": "Both SQL and ArcadeDB connections successful!"}
        elif results.get("sql") == "success":
            return {"status": "partial", "message": f"SQL connected, but ArcadeDB failed: {results.get('arcadedb')}"}
        elif results.get("arcadedb") == "success":
            return {"status": "partial", "message": f"ArcadeDB connected, but SQL failed: {results.get('sql')}"}
        else:
            return {"status": "error", "message": f"SQL failed: {results.get('sql')} | ArcadeDB failed: {results.get('arcadedb')}"}

from app.services.rag_service import rag_service

class RagConfigRequest(BaseModel):
    embedding_provider: str = "ollama"  # "ollama", "openai", "huggingface"
    embedding_model: str = "nomic-embed-text" 
    embedding_api_key: Optional[str] = None
    parsing_strategy: str = "recursive"  # "recursive", "window", "hierarchical"
    chunk_size: int = 1000
    chunk_overlap: int = 200
    enable_metadata: bool = False # Toggle Title/Summary extraction
    reset_db: bool = True # Force DB reset by default for safety

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
    
    # Resolve effective configuration from preset
    embedding_preset = config_service.get_default_embedding_preset()
    if embedding_preset:
        rag_config["embedding_model"] = embedding_preset.get("model_name")
        # Map preset type to provider
        if embedding_preset.get("type") == "remote":
            rag_config["embedding_provider"] = "openai"
        else:
            rag_config["embedding_provider"] = "ollama"
            
    return {"config": rag_config}

@router.post("/config/rag")
def save_rag_config(request: RagConfigRequest):
    print(f"Update RAG Config. Reset DB: {request.reset_db}")
    config = config_service.get_config()
    
    # Exclude temporary flag from persistence
    config_dict = request.dict()
    reset_required = config_dict.pop("reset_db", True)
    
    config["rag_config"] = config_dict
    config_service.save_config(config)
    
    if reset_required:
        rag_service.reset_db()
        msg = "Configuration saved and Database reset."
    else:
        rag_service.reload_config()
        msg = "Configuration hot-reloaded (No DB reset)."
        
    return {"status": "success", "config": config_dict, "message": msg}


class QueryingConfigRequest(BaseModel):
    # Retrieval
    similarity_top_k: int = 5
    similarity_cutoff: Optional[float] = None
    retrieval_mode: str = "embedding"  # embedding, hybrid, keyword

    # Postprocessing
    postprocessor: str = "none" # none, similarity_cutoff, keyword, cohere_rerank, ...
    postprocessor_config: Optional[Dict[str, Any]] = {} # api_key, threshold, etc.

    # Response Synthesis
    response_mode: str = "simple" # simple (default/manual), refine, tree_summarize, compact
    
@router.get("/config/querying")
def get_querying_config():
    config = config_service.get_config()
    # Defaults
    querying_config = config.get("querying_config", {
        "similarity_top_k": 5,
        "similarity_cutoff": None,
        "retrieval_mode": "embedding",
        "postprocessor": "none",
        "postprocessor_config": {},
        "response_mode": "simple"
    })
    return {"config": querying_config}

@router.post("/config/querying")
def save_querying_config(request: QueryingConfigRequest):
    config = config_service.get_config()
    config["querying_config"] = request.dict()
    config_service.save_config(config)
    
    # Reload RAG service with new settings
    rag_service.reload_config()
    
    return {"status": "success", "config": request.dict()}
