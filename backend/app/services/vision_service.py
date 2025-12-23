from abc import ABC, abstractmethod
from typing import List, Optional, Any, Dict
import base64
import os
import httpx
import json

from langchain_core.messages import HumanMessage, SystemMessage, BaseMessage
from langchain_openai import ChatOpenAI
from langchain_anthropic import ChatAnthropic
from langchain_ollama import ChatOllama
from app.models.chat import Message
from app.services.config_service import config_service

class VisionProvider(ABC):
    """Abstract base class for vision model providers."""
    
    @abstractmethod
    async def analyze_image(
        self, 
        image_data: str, 
        prompt: str, 
        system_prompt: Optional[str] = None,
        model_name: Optional[str] = None
    ) -> str:
        """
        Analyze an image (Base64) with a text prompt.
        
        Args:
            image_data: Base64 encoded image string.
            prompt: Human query or instruction.
            system_prompt: System context/persona.
            model_name: Specific model to use (e.g. gpt-4o).
            
        Returns:
            Text response from the model.
        """
        pass

class OpenAIVisionProvider(VisionProvider):
    """Provider for OpenAI-compatible vision models (GPT-4o, etc)."""
    
    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or os.getenv("OPENAI_API_KEY")
        
    async def analyze_image(
        self, 
        image_data: str, 
        prompt: str, 
        system_prompt: Optional[str] = None,
        model_name: Optional[str] = "gpt-4o"
    ) -> str:
        if not self.api_key:
            return "Error: OpenAI API key not configured."
            
        # Initialize model
        chat = ChatOpenAI(
            model=model_name, 
            openai_api_key=self.api_key,
            max_tokens=1024
        )
        
        messages: List[BaseMessage] = []
        
        # Add system prompt if present
        if system_prompt:
            messages.append(SystemMessage(content=system_prompt))
            
        # Construct multimodal user message
        # LangChain expects a list of content parts for multimodal
        # content=[{"type": "text", "text": ...}, {"type": "image_url", "image_url": {"url": ...}}]
        
        # Ensure base64 prefix if missing
        img_url = image_data
        if not image_data.startswith("data:image"):
            # Assume jpeg by default if raw base64
            img_url = f"data:image/jpeg;base64,{image_data}"
            
        user_content = [
            {"type": "text", "text": prompt},
            {
                "type": "image_url", 
                "image_url": {
                    "url": img_url,
                    "detail": "high"
                }
            }
        ]
        
        messages.append(HumanMessage(content=user_content))
        
        try:
            response = await chat.ainvoke(messages)
            return response.content
        except Exception as e:
            print(f"[OpenAIVisionProvider] Error: {e}")
            return f"Error analyzing image: {str(e)}"

class OllamaVisionProvider(VisionProvider):
    """Provider for Ollama-hosted vision models (Llama 3.2 Vision, LLaVA, etc)."""
    
    def __init__(self, base_url: str = "http://localhost:11434"):
        self.base_url = base_url
        
    async def analyze_image(
        self, 
        image_data: str, 
        prompt: str, 
        system_prompt: Optional[str] = None,
        model_name: Optional[str] = "llama3.2-vision"
    ) -> str:

        
        # Strip header if present to get raw base64
        img_b64 = image_data
        if "base64," in image_data:
            img_b64 = image_data.split("base64,")[1]

        # Validation: Check if image_data looks like JSON/Text metadata
        if len(img_b64) < 1000 and ("{" in img_b64 or "File:" in img_b64):
             print(f"[OllamaVisionProvider] ERROR: Image data appears to be text metadata, not base64! Content: {img_b64}")
             return "Error: Internal image fetch failed. The system received file metadata instead of image content."

        print(f"[OllamaVisionProvider] Analyzing with {model_name} via Direct API...")
        print(f"[OllamaVisionProvider] Image Size: {len(img_b64)} chars")

        # Construct raw payload for Ollama /api/chat
        # Ollama expects 'images' as a list of base64 strings (no data URI prefix)
        payload = {
            "model": model_name,
            "messages": [
                {
                    "role": "user",
                    "content": prompt,
                    "images": [img_b64] 
                }
            ],
            "stream": False
        }

        if system_prompt:
             # Prepend system message
             payload["messages"].insert(0, {"role": "system", "content": system_prompt})
        
        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{self.base_url}/api/chat", 
                    json=payload,
                    timeout=60.0 # Vision models can be slow
                )
                
                if response.status_code != 200:
                    error_text = response.text
                    print(f"[OllamaVisionProvider] API Error: {response.status_code} - {error_text}")
                    return f"Error from Ollama: {response.status_code} - {error_text}"
                
                result = response.json()
                # Extract content from response
                # Response format: { "model": "...", "created_at": "...", "message": { "role": "assistant", "content": "..." }, ... }
                return result.get("message", {}).get("content", "")

        except Exception as e:
            print(f"[OllamaVisionProvider] Exception: {e}")
            return f"Error analyzing image with Ollama (Direct API): {str(e)}"

class VisionService:
    """Service to manage vision capabilities and model selection."""
    
    def __init__(self):
        # In a real app, we might load these from config
        self._providers: Dict[str, VisionProvider] = {
            "openai": OpenAIVisionProvider(),
            "ollama": OllamaVisionProvider()
        }
        
    def _get_provider(self, model_name: str) -> VisionProvider:
        """
        Resolve the correct provider based on model name or config.
        """
        # 0. Handle "default" model request
        if model_name == "default":
            default_vision = config_service.get_default_vision_preset()
            if default_vision:
                 if default_vision.get("type") == "local":
                     return self._providers["ollama"]
                 # Fall through for remote default (check below or assume OpenAI logic)
                 # Actually if it is remote, we need to know WHICH provider. 
                 # For now, if it's not local, we assume OpenAI provider handles the remote URL/Key logic 
                 # (Implementation detail: OpenAIVisionProvider might need update to read from preset if passed?)
                 # For now let's assume if type!=local it means we use OpenAI provider but update it 
                 # to potentially use the preset Config? 
                 # "OpenAIVisionProvider" currently reads env var.
                 # Let's return OpenAI provider but we might need to injecting config.
                 return self._providers["openai"]
        
        # 1. Check if model matches the default vision preset (e.g. user passed "llava" explicitly and it is the default)
        default_vision = config_service.get_default_vision_preset()
        if default_vision and default_vision.get("model_name") == model_name:
             if default_vision.get("type") == "local":
                 return self._providers["ollama"]

        # 1b. Check against default LLM preset (legacy support or if using multi-model)
        # Some users might set a multimodal model as their LLM default
        default_llm = config_service.get_default_llm_preset()
        if default_llm and default_llm.get("model_name") == model_name:
             if default_llm.get("type") == "local":
                  return self._providers["ollama"]
        
        # 2. Heuristic check based on model name
        if model_name.startswith("gpt") or model_name.startswith("o1"):
            return self._providers["openai"]
        
        if model_name.startswith("claude"):
             # Placeholder for anthropic
             return self._providers["openai"] # or anthropic if implemented
             
        # Default to Ollama for unknown local-sounding names or explicit llama/qwen
        if any(x in model_name.lower() for x in ["llama", "llava", "moondream", "qwen", "minicpm"]):
            return self._providers["ollama"]
            
        # Fallback to OpenAI if unsure? Or Ollama?
        return self._providers["ollama"]

    async def analyze(
        self,
        image_data: str,
        prompt: str,
        system_prompt: Optional[str] = None,
        model_name: str = "gpt-4o"
    ) -> str:
        """
        Facade method to analyze an image using the appropriate provider.
        """
        config = config_service.get_config()
        presets = config.get("presets", [])
        
        # 1. Resolve 'model_name' to a Preset
        target_preset = None
        
        if model_name == "default":
            target_preset = config_service.get_default_vision_preset()
            if not target_preset:
                target_preset = config_service.get_default_llm_preset()
        else:
            # Check if input matches a Preset Name
            target_preset = next((p for p in presets if p["name"] == model_name), None)
            
        # 2. Determine Provider & Actual Model Tag
        provider = None
        actual_model_tag = model_name # Fallback: assume input was a raw tag
        
        if target_preset:
            print(f"[VisionService] Resolved '{model_name}' to preset '{target_preset['name']}'")
            if target_preset.get("type") == "local":
                provider = self._providers["ollama"]
                actual_model_tag = target_preset.get("model_name", "llama3.2-vision")
            else:
                provider = self._providers["openai"]
                # For remote, if the preset has a specific model_name, use it, else default
                # ModelConfig currently might not save 'model_name' for remote types, 
                # but if we want to support it we can check.
                actual_model_tag = target_preset.get("model_name") or "gpt-4o"
        else:
            # No preset found. Use heuristic or legacy logic.
            print(f"[VisionService] No preset found for '{model_name}'. Treating as raw tag.")
            provider = self._get_provider(model_name)
            actual_model_tag = model_name

        provider_name = "Ollama" if isinstance(provider, OllamaVisionProvider) else "OpenAI"
        print(f"[VisionService] Routing to provider: {provider_name} with tag: '{actual_model_tag}'")
        
        # Log approximate image size to verify cropping
        img_len = len(image_data)
        # print(f"[VisionService] Image Payload Size: {img_len} chars (approx {img_len * 3 / 4 / 1024:.1f} KB)")

        return await provider.analyze_image(
            image_data=image_data, 
            prompt=prompt, 
            system_prompt=system_prompt, 
            model_name=actual_model_tag
        )

# Singleton instance
vision_service = VisionService()
