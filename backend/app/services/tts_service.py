import os
from google import genai
from google.genai import types
import httpx
import wave
import io
from typing import Optional, Dict, Any

class TtsService:
    async def generate_speech(self, text: str, config: Dict[str, Any]) -> Optional[bytes]:
        print(f"[TtsService] generate_speech called with config: {config}")
        if not config:
             # Fallback if no config is provided, but this shouldn't happen with the router check
             return None
             
        api_url = config.get("api_url") or ""
        
        # Only use native Gemini SDK if we are talking to Google directly
        if "generativelanguage.googleapis.com" in api_url:
            return await self._generate_gemini_speech(text, config)
        else:
            return await self._generate_openai_speech(text, config)

    async def _generate_gemini_speech(self, text: str, config: Dict[str, Any]) -> Optional[bytes]:
        api_key = config.get("service_api_key") or config.get("model_api_key")
        if not api_key:
            raise ValueError("Gemini API Key not configured")

        client = genai.Client(api_key=api_key, http_options={'api_version': 'v1beta'})
        model_id = config.get("model_name", "gemini-3.1-flash-tts-preview")
        if model_id.startswith("google/"):
            model_id = model_id.replace("google/", "")
        
        voice_name = config.get("voice_name", "Puck")
        
        speed = config.get("speed", 1.0)
        pitch = config.get("pitch", 1.0)
        
        speed_desc = "normal speed"
        if speed > 1.2: speed_desc = "fast"
        elif speed < 0.8: speed_desc = "slow"
        
        pitch_desc = "normal pitch"
        if pitch > 1.2: pitch_desc = "high-pitched"
        elif pitch < 0.8: pitch_desc = "low-pitched"

        prompt = (
            f"Please read the following text exactly as written. \n"
            f"Tone instructions: Speak with a {pitch_desc} and at a {speed_desc} pace. \n"
            f"Text: {text}"
        )
        
        try:
            # Using the new genai.Client (async) with correct configuration
            response = await client.aio.models.generate_content(
                model=model_id,
                contents=prompt,
                config=types.GenerateContentConfig(
                    response_modalities=["AUDIO"],
                    speech_config=types.SpeechConfig(
                        voice_config=types.VoiceConfig(
                            prebuilt_voice_config=types.PrebuiltVoiceConfig(
                                voice_name=voice_name
                            )
                        )
                    )
                )
            )
            
            for part in response.candidates[0].content.parts:
                if part.inline_data:
                    pcm_data = part.inline_data.data
                    # Gemini returns raw PCM, we need to wrap it in a WAV header for the browser
                    return self._wrap_pcm_in_wav(pcm_data)
            
            return None

        except Exception as e:
            print(f"[TtsService] Gemini Error: {e}")
            raise e

    async def _generate_openai_speech(self, text: str, config: Dict[str, Any]) -> Optional[bytes]:
        api_key = config.get("service_api_key") or config.get("model_api_key")
        api_url = config.get("api_url", "https://api.openai.com/v1")
        
        if not api_url.endswith("/audio/speech"):
            api_url = api_url.rstrip("/") + "/audio/speech"

        voice = config.get("voice_name", "alloy")
        model = config.get("model_name", "tts-1")
        speed = config.get("speed", 1.0)
        final_text = text

        async with httpx.AsyncClient() as client:
            headers = {
                "Authorization": f"Bearer {api_key}",
                "HTTP-Referer": "https://semantic-canvas.ai", # Required by some OpenRouter providers
                "X-Title": "ArchVantage",
                "Content-Type": "application/json"
            }
            print(f"[TtsService] Sending OpenAI TTS request: model={model}, voice={voice}, speed={speed}, format={config.get('response_format', 'mp3')}")
            response = await client.post(
                api_url,
                headers=headers,
                json={
                    "model": model,
                    "input": final_text,
                    "voice": voice,
                    "speed": speed,
                    "response_format": config.get("response_format", "mp3")
                },
                timeout=30.0
            )
            
            if response.status_code != 200:
                print(f"[TtsService] OpenAI Error: {response.text}")
                raise Exception(f"OpenAI TTS failed: {response.text}")
            
            content = response.content
            # If the format is raw PCM, the browser won't play it directly.
            # We need to wrap it in a WAV header.
            if config.get("response_format") == "pcm":
                print("[TtsService] Wrapping raw OpenAI PCM in WAV container")
                return self._wrap_pcm_in_wav(content)
                
            return content

    def _wrap_pcm_in_wav(self, pcm_data: bytes, sample_rate: int = 24000, num_channels: int = 1, sample_width: int = 2) -> bytes:
        """
        Wraps raw PCM bytes into a WAV container.
        Default for Gemini is 24kHz, Mono, 16-bit (2 bytes per sample).
        """
        with io.BytesIO() as wav_io:
            with wave.open(wav_io, 'wb') as wav_file:
                wav_file.setnchannels(num_channels)
                wav_file.setsampwidth(sample_width)
                wav_file.setframerate(sample_rate)
                wav_file.writeframes(pcm_data)
            return wav_io.getvalue()

tts_service = TtsService()
