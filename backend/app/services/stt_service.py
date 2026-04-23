import io
import httpx
from abc import ABC, abstractmethod
from typing import Optional
from app.models.stt_models import SttConfig, STTProviderType

class STTProviderInterface(ABC):
    @abstractmethod
    async def transcribe(self, audio_data: bytes, filename: str, config: SttConfig) -> str:
        """Transcribe audio blob and return text result."""
        pass

class OpenRouterSTTProvider(STTProviderInterface):
    async def transcribe(self, audio_data: bytes, filename: str, config: SttConfig) -> str:
        endpoint = config.api_endpoint or "https://api.openai.com/v1/audio/transcriptions"
        if endpoint and not endpoint.endswith("/audio/transcriptions") and not endpoint.endswith("/transcriptions"):
            endpoint = endpoint.rstrip("/") + "/audio/transcriptions"
            
        api_key = config.api_key
        model_id = config.model_id or "openai/whisper-large-v3"
        
        headers = {
            "Authorization": f"Bearer {api_key}"
        }
        
        # OpenRouter/OpenAI API expects multipart/form-data for files
        files = {
            # We must specify the filename and mime type. The frontend sends webm.
            "file": (filename, audio_data, "audio/webm")
        }
        
        data = {
            "model": model_id,
            "response_format": "json"
        }
        
        if config.language_code and config.language_code != "Auto-detect":
            # Just take the first part of locale like 'en' from 'en-US'
            data["language"] = config.language_code.split('-')[0]
            
        if config.temperature:
            data["temperature"] = config.temperature
            
        if config.prompt:
            data["prompt"] = config.prompt

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
    async def transcribe(self, audio_data: bytes, filename: str, config: SttConfig) -> str:
        endpoint = config.api_endpoint
        if not endpoint:
            raise ValueError("Local STT requires an endpoint URL")
            
        if endpoint and not endpoint.endswith("/audio/transcriptions") and not endpoint.endswith("/transcriptions"):
            endpoint = endpoint.rstrip("/") + "/audio/transcriptions"
            
        # For simplicity, assuming local provider mimics OpenAI's Whisper API interface
        files = {
            "file": (filename, audio_data, "audio/webm")
        }
        data = {
            "model": config.model_id or "whisper-1",
        }
        
        headers = {}
        if config.api_key:
            headers["Authorization"] = f"Bearer {config.api_key}"
            
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
            STTProviderType.REMOTE: OpenRouterSTTProvider(),
            STTProviderType.LOCAL: LocalWhisperSTTProvider()
            # BROWSER is handled client-side
        }

    async def transcribe_audio(self, audio_data: bytes, filename: str, config: SttConfig) -> str:
        provider = self.providers.get(config.provider_type)
        if not provider:
            raise ValueError(f"STT feature is not natively supported server-side for provider: {config.provider_type}")
            
        return await provider.transcribe(audio_data, filename, config)

stt_service = STTService()
