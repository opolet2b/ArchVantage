import io
import httpx
import json
from abc import ABC, abstractmethod
from typing import Optional, Dict, Any
from app.services.debug_service import debug_service

class STTProviderInterface(ABC):
    @abstractmethod
    async def transcribe(self, audio_data: bytes, filename: str, config: Dict[str, Any]) -> str:
        """Transcribe audio blob and return text result."""
        pass

class GenericWhisperProvider(STTProviderInterface):
    """
    A robust, protocol-aware Whisper provider that handles both OpenAI-compatible
    and raw/legacy Docker-based ASR endpoints.
    """
    async def transcribe(self, audio_data: bytes, filename: str, config: Dict[str, Any]) -> str:
        endpoint = config.get("api_endpoint")
        protocol = config.get("api_protocol", "OPENAI")
        
        debug_service.log("INFO", "Settings", "STT", f"Starting transcription. Protocol: {protocol}, Endpoint: {endpoint}")
        
        if not endpoint:
            endpoint = "http://localhost:11434/v1" if config.get("provider_type") == "local" else "https://api.openai.com/v1"

        # Protocol Formatting
        if protocol == "OPENAI":
            if not endpoint.endswith("/audio/transcriptions") and not endpoint.endswith("/transcriptions"):
                endpoint = endpoint.rstrip("/") + "/v1/audio/transcriptions" if "/v1" not in endpoint and "api.openai" not in endpoint else endpoint.rstrip("/") + "/audio/transcriptions"
        
        debug_service.log("INFO", "Settings", "STT", f"Final target URL: {endpoint}")

        api_key = config.get("api_key")
        model_id = config.get("model_id")
        lang = config.get("language_code")
        
        headers = {}
        if api_key:
            headers["Authorization"] = f"Bearer {api_key}"
        
        async def try_transcribe(url: str, file_field: str, model_field: Optional[str] = None):
            debug_service.log("INFO", "Settings", "STT", f"Trying {url} | File: {file_field} | Model Field: {model_field or 'None'}")
            files = {file_field: (filename, audio_data, "audio/webm")}
            
            data = {}
            if model_id and model_field:
                data[model_field] = model_id
            elif protocol == "OPENAI" and not model_id:
                data["model"] = "whisper-1"
                
            if lang and lang != "Auto-detect":
                data["language"] = lang.split('-')[0]
            
            async with httpx.AsyncClient(timeout=60.0) as client:
                try:
                    response = await client.post(url, headers=headers, data=data, files=files)
                    return response
                except Exception as e:
                    debug_service.log("ERROR", "Settings", "STT", f"Request failed: {str(e)}")
                    raise e

        # Stage 1: Try 'model' field
        response = await try_transcribe(endpoint, "file", "model")
        
        # Stage 2: Try alternatives if 'model' failed
        if response.status_code in [400, 422, 500]:
            debug_service.log("WARNING", "Settings", "STT", f"Attempt with 'model' failed ({response.status_code}). Trying 'model_name'...")
            alt_response = await try_transcribe(endpoint, "file", "model_name")
            if alt_response.status_code == 200:
                response = alt_response
            else:
                debug_service.log("WARNING", "Settings", "STT", "Attempt with 'model_name' failed. Trying 'model_name_or_path'...")
                alt_response = await try_transcribe(endpoint, "file", "model_name_or_path")
                if alt_response.status_code == 200:
                    response = alt_response
                elif response.status_code == 500:
                    # Stage 4: Try NO model field at all
                    debug_service.log("WARNING", "Settings", "STT", "All model fields failed. Trying with NO model field...")
                    alt_response = await try_transcribe(endpoint, "file", None)
                    if alt_response.status_code == 200:
                        response = alt_response
        
        # Attempt 2: If 'file' field failed (likely 400/422), try 'audio_file'
        if response.status_code in [400, 422, 404, 405]:
            debug_service.log("WARNING", "Settings", "STT", f"Primary attempt failed ({response.status_code}). Trying alternative field 'audio_file'...")
            try:
                alt_response = await try_transcribe(endpoint, "audio_file")
                if alt_response.status_code == 200:
                    response = alt_response
                else:
                     # If both fail but it was a 404/405, maybe the PATH is wrong. 
                     # Try the root URL if it's RAW protocol.
                     if protocol == "RAW" and response.status_code in [404, 405]:
                         base_url = "/".join(endpoint.split("/")[:3]) + "/asr"
                         debug_service.log("WARNING", "Settings", "STT", f"Path error? Trying fallback path: {base_url}")
                         response = await try_transcribe(base_url, "file")
            except:
                pass

        if response.status_code != 200:
            error_msg = response.text[:200]
            debug_service.log("ERROR", "Settings", "STT", f"Transcription failed with status {response.status_code}: {error_msg}")
            raise Exception(f"STT Provider Error ({response.status_code}): {error_msg}")
            
        result = response.json()
        text_result = result.get("text") or result.get("transcript") or result.get("results", [{}])[0].get("transcript")
        
        if not text_result:
             debug_service.log("ERROR", "Settings", "STT", f"No text found in response: {json.dumps(result)}")
             return str(result)
             
        debug_service.log("INFO", "Settings", "STT", f"Transcription successful! Length: {len(text_result)}")
        return text_result

class STTService:
    def __init__(self):
        self.universal_provider = GenericWhisperProvider()

    async def transcribe_audio(self, audio_data: bytes, filename: str, config: Dict[str, Any]) -> str:
        return await self.universal_provider.transcribe(audio_data, filename, config)

stt_service = STTService()
