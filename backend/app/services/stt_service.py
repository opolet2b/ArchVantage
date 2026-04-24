import io
import httpx
from abc import ABC, abstractmethod
from typing import Optional, Dict, Any

class STTProviderInterface(ABC):
    @abstractmethod
    async def transcribe(self, audio_data: bytes, filename: str, config: Dict[str, Any]) -> str:
        """Transcribe audio blob and return text result."""
        pass

class OpenRouterSTTProvider(STTProviderInterface):
    async def transcribe(self, audio_data: bytes, filename: str, config: Dict[str, Any]) -> str:
        endpoint = config.get("api_endpoint") or "https://api.openai.com/v1/audio/transcriptions"
        if endpoint and not endpoint.endswith("/audio/transcriptions") and not endpoint.endswith("/transcriptions"):
            endpoint = endpoint.rstrip("/") + "/audio/transcriptions"
            
        api_key = config.get("api_key")
        model_id = config.get("model_id") or "openai/whisper-large-v3"
        
        headers = {
            "Authorization": f"Bearer {api_key}",
            "HTTP-Referer": "https://semantic-canvas.ai",
            "X-Title": "Semantic Canvas"
        }
        
        files = {
            "file": (filename, audio_data, "audio/webm")
        }
        
        data = {
            "model": model_id,
            "response_format": "json"
        }
        
        lang = config.get("language_code")
        if lang and lang != "Auto-detect":
            data["language"] = lang.split('-')[0]
            
        temp = config.get("temperature")
        if temp:
            data["temperature"] = temp
            
        prompt = config.get("prompt")
        if prompt:
            data["prompt"] = prompt

        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                endpoint,
                headers=headers,
                data=data,
                files=files
            )
            
            if response.status_code != 200:
                error_body = response.text[:200]
                try:
                    json_err = response.json()
                    error_body = json_err.get("error", {}).get("message", str(json_err))
                except:
                    pass
                raise Exception(f"Provider STT Error {response.status_code}: {error_body}")
                
            result = response.json()
            return result.get("text", "")

class LocalWhisperSTTProvider(STTProviderInterface):
    async def transcribe(self, audio_data: bytes, filename: str, config: Dict[str, Any]) -> str:
        endpoint = config.get("api_endpoint")
        if not endpoint:
            raise ValueError("Local STT requires an endpoint URL")
            
        if endpoint and not endpoint.endswith("/audio/transcriptions") and not endpoint.endswith("/transcriptions"):
            endpoint = endpoint.rstrip("/") + "/audio/transcriptions"
            
        files = {
            "file": (filename, audio_data, "audio/webm")
        }
        data = {
            "model": config.get("model_id") or "whisper-1",
        }
        
        lang = config.get("language_code")
        if lang and lang != "Auto-detect":
            data["language"] = lang.split('-')[0]
        
        headers = {}
        api_key = config.get("api_key")
        if api_key:
            headers["Authorization"] = f"Bearer {api_key}"
            
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                endpoint,
                headers=headers,
                data=data,
                files=files
            )
            response.raise_for_status()
            result = response.json()
            return result.get("text", "")

class STTService:
    def __init__(self):
        self.providers = {
            "remote": OpenRouterSTTProvider(),
            "local": LocalWhisperSTTProvider()
        }

    async def transcribe_audio(self, audio_data: bytes, filename: str, config: Dict[str, Any]) -> str:
        provider_type = config.get("provider_type", "remote")
        provider = self.providers.get(provider_type)
        if not provider:
            raise ValueError(f"STT feature is not natively supported server-side for provider: {provider_type}")
            
        return await provider.transcribe(audio_data, filename, config)

stt_service = STTService()
