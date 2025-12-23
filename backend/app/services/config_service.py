import json
import os
import httpx
from typing import Dict, Any, List, Optional

CONFIG_FILE = "data/config.json"

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
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get("http://localhost:11434/api/tags")
                if response.status_code == 200:
                    data = response.json()
                    return [model["name"] for model in data.get("models", [])]
                return []
        except Exception as e:
            print(f"Error fetching Ollama models: {e}")
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

    # Deprecated but kept for compatibility during refactor
    def get_active_preset(self) -> Optional[Dict[str, Any]]:
        return self.get_default_llm_preset()

    def set_active_preset(self, preset_name: str):
         self.set_default_llm_preset(preset_name)

config_service = ConfigService()
