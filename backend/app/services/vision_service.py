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
        model_name: Optional[str] = None,
        api_key: Optional[str] = None,
        base_url: Optional[str] = None,
        model_kwargs: Optional[Dict[str, Any]] = None
    ) -> str:
        """
        Analyze an image (Base64) with a text prompt.
        
        Args:
            image_data: Base64 encoded image string.
            prompt: Human query or instruction.
            system_prompt: System context/persona.
            model_name: Specific model to use (e.g. gpt-4o).
            api_key: Optional API key override.
            base_url: Optional Base URL override.
            model_kwargs: Optional extra arguments (e.g., sort strategy).
            
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
        model_name: Optional[str] = "gpt-4o",
        api_key: Optional[str] = None,
        base_url: Optional[str] = None,
        model_kwargs: Optional[Dict[str, Any]] = None
    ) -> str:
        # Use provided key or fallback to env or self.api_key
        final_api_key = api_key or self.api_key
        
        if not final_api_key:
            return "Error: OpenAI API key not configured."
            
        # Initialize model
        chat = ChatOpenAI(
            model=model_name, 
            openai_api_key=final_api_key,
            openai_api_base=base_url,
            max_tokens=1024,
            request_timeout=600.0, # 10m timeout for thinking models
            model_kwargs=model_kwargs or {}
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
            # PyMuPDF in canvas_worker generates PNGs
            img_url = f"data:image/png;base64,{image_data}"
            
        user_content = [
            {
                "type": "image_url", 
                "image_url": {
                    "url": img_url
                }
            },
            {"type": "text", "text": prompt}
        ]
        
        messages.append(HumanMessage(content=user_content))
        
        import time
        start_time = time.perf_counter()
        print(f"[OpenAIVisionProvider] Sending request to {base_url or 'OpenAI'} for model {model_name} (Payload size: {len(image_data)} chars)...")
        
        try:
            response = await chat.ainvoke(messages)
            elapsed = time.perf_counter() - start_time
            print(f"[OpenAIVisionProvider] Received response in {elapsed:.2f}s. Content len: {len(response.content)} chars.")
            return response.content
        except Exception as e:
            elapsed = time.perf_counter() - start_time
            print(f"[OpenAIVisionProvider] Error after {elapsed:.2f}s: {e}")
            raise e

class OllamaVisionProvider(VisionProvider):
    """Provider for Ollama-hosted vision models (Llama 3.2 Vision, LLaVA, etc)."""
    
    def __init__(self, base_url: str = "http://localhost:11434"):
        self.base_url = base_url
        
    async def analyze_image(
        self, 
        image_data: str, 
        prompt: str, 
        system_prompt: Optional[str] = None,
        model_name: Optional[str] = "llama3.2-vision",
        api_key: Optional[str] = None,
        base_url: Optional[str] = None, # Used if provided, else self.base_url
        model_kwargs: Optional[Dict[str, Any]] = None
    ) -> str:

        
        # Strip header if present to get raw base64
        img_b64 = image_data
        if "base64," in image_data:
            img_b64 = image_data.split("base64,")[1]
        
        # Clean up whitespace (fix for "illegal base64 data at input byte 0")
        img_b64 = img_b64.strip()

        print(f"[OllamaVisionProvider] Analyzing with {model_name} via Direct API...")
        print(f"[OllamaVisionProvider] Input Preview (first 50): {image_data[:50]}")
        print(f"[OllamaVisionProvider] Base64 Preview (first 50): {img_b64[:50]}")
        print(f"[OllamaVisionProvider] Image Size: {len(img_b64)} chars")

        # Construct raw payload for Ollama /api/chat
        # Ollama expects 'images' as a list of base64 strings (no data URI prefix)
        # Construct options with defaults
        options = {
            "temperature": 0.3,
            "repeat_penalty": 1.2,
            "num_ctx": 8192,
            "top_k": 40,
            "top_p": 0.9
        }
        
        # Override with model_kwargs from preset if available
        if model_kwargs:
            for k, v in model_kwargs.items():
                # Map common names to Ollama option names if necessary
                if k == "max_tokens":
                    options["num_predict"] = v
                elif k in options:
                    options[k] = v

        payload = {
            "model": model_name,
            "messages": [
                {
                    "role": "user",
                    "content": prompt,
                    "images": [img_b64] 
                }
            ],
            "stream": False,
            "options": options
        }

        if system_prompt:
             # Prepend system message
             payload["messages"].insert(0, {"role": "system", "content": system_prompt})
        
        import time
        start_time = time.perf_counter()
        final_base_url = base_url or self.base_url
        
        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{final_base_url}/api/chat", 
                    json=payload,
                    timeout=600.0 # Vision models can be slow (increased to 10m)
                )
                
                elapsed = time.perf_counter() - start_time
                if response.status_code != 200:
                    error_text = response.text
                    print(f"[OllamaVisionProvider] API Error after {elapsed:.2f}s: {response.status_code} - {error_text}")
                    return f"Error from Ollama: {response.status_code} - {error_text}"
                
                print(f"[OllamaVisionProvider] Received response in {elapsed:.2f}s.")
                
                result = response.json()
                # DEBUG: Log raw output to catch empty responses
                if not result.get("message", {}).get("content"):
                    print(f"[OllamaVisionProvider] WARNING: Empty content in response! Raw: {response.text}")
                
                # Extract content from response
                # Response format: { "model": "...", "created_at": "...", "message": { "role": "assistant", "content": "..." }, ... }
                return result.get("message", {}).get("content", "")

        except Exception as e:
            import traceback
            print(f"[OllamaVisionProvider] Exception Type: {type(e)}")
            print(f"[OllamaVisionProvider] Exception Repr: {repr(e)}")
            print(f"[OllamaVisionProvider] Traceback: {traceback.format_exc()}")
            raise e # Raise exception to be caught by worker

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
        model_name: str = "default"
    ) -> str:
        """
        Facade method to analyze an image using the appropriate provider.
        Resolves model names/presets and uses all configured parameters.
        """
        # 1. Resolve 'model_name' to a Preset Configuration
        target_preset = None
        
        if model_name == "default":
            target_preset = config_service.get_default_vision_preset()
            # If no vision-specific default, try LLM default
            if not target_preset:
                target_preset = config_service.get_default_llm_preset()
        else:
            # Try to get the preset by name
            target_preset = config_service.get_preset_config(model_name)
            
            # Fallback: check if input matches a model_name tag within presets
            if not target_preset:
                config = config_service.get_config()
                presets = config.get("presets", [])
                target_preset = next((p for p in presets if p.get("model_name") == model_name), None)

        # 2. Extract parameters from the configuration
        provider = None
        actual_model_tag = model_name  # Fallback: assume input was a raw tag
        api_key = None
        base_url = None
        model_kwargs = {}

        if target_preset:
            preset_name = target_preset.get("name", "Unknown")
            print(f"[VisionService] Resolved model configuration: '{preset_name}'")
            
            # Determine Provider
            if target_preset.get("type") == "local":
                provider = self._providers["ollama"]
                actual_model_tag = target_preset.get("model_name")
                if not actual_model_tag:
                    raise ValueError(f"Preset '{preset_name}' is missing 'model_name' (tag) for Ollama")
                # Use configured API URL for local Ollama if provided
                base_url = target_preset.get("api_url") or "http://localhost:11434"
            else:
                provider = self._providers["openai"]
                actual_model_tag = target_preset.get("model_name")
                if not actual_model_tag:
                    raise ValueError(f"Preset '{preset_name}' is missing 'model_name' for remote provider")
                api_key = target_preset.get("service_api_key")
                base_url = target_preset.get("api_url")
                
                # Handle OpenRouter/Proxy sort strategy
                sort_strategy = target_preset.get("sort")
                extra_body = {}
                if sort_strategy:
                    extra_body["provider"] = {"sort": sort_strategy}
                
                # If pointing to local vLLM, add the chat template kwargs to prevent thinking loops
                if base_url and "thalabus" in base_url.lower():
                    extra_body["chat_template_kwargs"] = {"enable_thinking": False}
                    
                if extra_body:
                    model_kwargs["extra_body"] = extra_body

            # Extract common LLM parameters if present
            if "temperature" in target_preset:
                model_kwargs["temperature"] = target_preset["temperature"]
            if "max_tokens" in target_preset:
                model_kwargs["max_tokens"] = target_preset["max_tokens"]
            if "top_p" in target_preset:
                model_kwargs["top_p"] = target_preset["top_p"]
            
            print(f"[VisionService] Configured Model Tag: '{actual_model_tag}' via {base_url or 'default service'}")
        else:
            # No preset found. Use heuristic or legacy logic.
            print(f"[VisionService] No preset found for '{model_name}'. Treating as raw model tag.")
            provider = self._get_provider(model_name)
            actual_model_tag = model_name
            if provider == self._providers["openai"]:
                api_key = os.getenv("OPENAI_API_KEY")

        # 3. Execute analysis
        return await provider.analyze_image(
            image_data=image_data, 
            prompt=prompt, 
            system_prompt=system_prompt, 
            model_name=actual_model_tag,
            api_key=api_key,
            base_url=base_url,
            model_kwargs=model_kwargs
        )

# Singleton instance
vision_service = VisionService()
