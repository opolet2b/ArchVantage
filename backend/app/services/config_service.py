import json
import os
import httpx
from typing import Dict, Any, List, Optional

# Root of the backend directory
BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
CONFIG_FILE = os.path.join(BASE_DIR, "data", "config.json")

class ConfigService:
    def __init__(self):
        self.config_file = CONFIG_FILE
        self._ensure_config_file()

    def _ensure_config_file(self):
        if not os.path.exists("data"):
            os.makedirs("data")
        if not os.path.exists(self.config_file):
            self.save_config({})

    def get_config(self) -> Dict[str, Any]:
        try:
            with open(self.config_file, "r") as f:
                return json.load(f)
        except Exception as e:
            print(f"Error reading config: {e}")
            return {}

    def save_config(self, config: Dict[str, Any]) -> Dict[str, Any]:
        try:
            with open(self.config_file, "w") as f:
                json.dump(config, f, indent=4)
            return config
        except Exception as e:
            print(f"Error saving config: {e}")
            raise e

    async def get_ollama_models(self) -> List[str]:
        ollama_url = os.environ.get("OLLAMA_URL", "http://localhost:11434")
        print(f"[ConfigService] Attempting to fetch Ollama models from: {ollama_url}/api/tags")
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(f"{ollama_url}/api/tags", timeout=5.0)
                if response.status_code == 200:
                    data = response.json()
                    models = [model["name"] for model in data.get("models", [])]
                    print(f"[ConfigService] Successfully fetched models: {models}")
                    return models
                else:
                    print(f"[ConfigService] Failed to fetch models. Status code: {response.status_code}, Response: {response.text}")
                    return []
        except Exception as e:
            print(f"[ConfigService] Connection error when fetching Ollama models from {ollama_url}: {str(e)}")
            return []

    def get_default_llm_preset(self) -> Optional[Dict[str, Any]]:
        config = self.get_config()
        
        # New key
        preset_name = config.get("default_llm_preset_name")
        
        # Migration/Fallback: Use old 'active_preset_name' if new one not set
        if not preset_name:
            preset_name = config.get("active_preset_name")
            
        if not preset_name:
            return None
            
        presets = config.get("presets", [])
        return next((p for p in presets if p["name"] == preset_name), None)

    def get_preset_config(self, preset_name: str) -> Optional[Dict[str, Any]]:
        config = self.get_config()
        presets = config.get("presets", [])
        return next((p for p in presets if p["name"] == preset_name), None)

    def set_default_llm_preset(self, preset_name: str):
        config = self.get_config()
        config["default_llm_preset_name"] = preset_name
        self.save_config(config)

    def get_default_vision_preset(self) -> Optional[Dict[str, Any]]:
        config = self.get_config()
        
        # New key
        preset_name = config.get("default_vision_preset_name")
        
        # No fallback to 'active_preset_name' for vision specifically, 
        # unless we want to assume the old active was also vision? 
        # Safer to just return None or let user configure it.
        # However, for smooth migration, if 'active_preset_name' points to a vision-capable model, 
        # we COULD use it, but let's stick to explicit setting or None.
        if not preset_name:
             # Logic: If no specific vision default, maybe use LLM default if it supports vision?
             # For now, strict separation.
             return None

        presets = config.get("presets", [])
        return next((p for p in presets if p["name"] == preset_name), None)

    def set_default_vision_preset(self, preset_name: str):
        config = self.get_config()
        config["default_vision_preset_name"] = preset_name
        self.save_config(config)

    def get_default_embedding_preset(self) -> Optional[Dict[str, Any]]:
        config = self.get_config()
        preset_name = config.get("default_embedding_preset_name")
        if not preset_name:
             return None
        presets = config.get("presets", [])
        return next((p for p in presets if p["name"] == preset_name), None)

    def set_default_embedding_preset(self, preset_name: str):
        config = self.get_config()
        config["default_embedding_preset_name"] = preset_name
        self.save_config(config)

    def get_default_speech_preset(self) -> Optional[Dict[str, Any]]:
        config = self.get_config()
        preset_name = config.get("default_speech_preset_name")
        if not preset_name:
             return None
        presets = config.get("presets", [])
        return next((p for p in presets if p["name"] == preset_name), None)

    def set_default_speech_preset(self, preset_name: str):
        config = self.get_config()
        config["default_speech_preset_name"] = preset_name
        self.save_config(config)

    def get_default_tts_preset(self) -> Optional[Dict[str, Any]]:
        config = self.get_config()
        preset_name = config.get("default_tts_preset_name")
        if not preset_name:
             return None
        presets = config.get("presets", [])
        return next((p for p in presets if p["name"] == preset_name), None)

    def set_default_tts_preset(self, preset_name: str):
        config = self.get_config()
        config["default_tts_preset_name"] = preset_name
        self.save_config(config)

    def get_editor_config(self) -> Dict[str, Any]:
        config = self.get_config()
        return config.get("editor_config", {
            "use_collabora": False,
            "collabora_server_url": ""
        })

    def set_editor_config(self, use_collabora: bool, collabora_server_url: str):
        config = self.get_config()
        config["editor_config"] = {
            "use_collabora": use_collabora,
            "collabora_server_url": collabora_server_url
        }
        self.save_config(config)

    # Deprecated but kept for compatibility during refactor
    def get_active_preset(self) -> Optional[Dict[str, Any]]:
        return self.get_default_llm_preset()

    def set_active_preset(self, preset_name: str):
         self.set_default_llm_preset(preset_name)

    def delete_preset(self, preset_name: str) -> bool:
        """Deletes a preset by name. Returns True if deleted, False if not found."""
        config = self.get_config()
        presets = config.get("presets", [])
        
        # Check if exists
        initial_len = len(presets)
        config["presets"] = [p for p in presets if p["name"] != preset_name]
        
        if len(config["presets"]) < initial_len:
            # Also clear defaults if they pointed to this preset
            if config.get("default_llm_preset_name") == preset_name:
                config["default_llm_preset_name"] = None
            if config.get("default_vision_preset_name") == preset_name:
                config["default_vision_preset_name"] = None
            if config.get("default_embedding_preset_name") == preset_name:
                 config["default_embedding_preset_name"] = None
            if config.get("default_speech_preset_name") == preset_name:
                 config["default_speech_preset_name"] = None
            if config.get("default_tts_preset_name") == preset_name:
                 config["default_tts_preset_name"] = None
                
            self.save_config(config)
            return True
            
        return False

config_service = ConfigService()
