from abc import ABC, abstractmethod
from typing import List, Optional, Any, Dict
import base64
import os

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
        # Initialize model
        chat = ChatOllama(
            model=model_name,
            base_url=self.base_url,
            temperature=0
        )
        
        messages: List[BaseMessage] = []
        
        # Add system prompt if present
        if system_prompt:
            messages.append(SystemMessage(content=system_prompt))
            
        # Construct multimodal message for Ollama
        # LangChain's ChatOllama handles the standard image_url format
        
        # Ensure base64 prefix if missing
        img_url = image_data
        if not image_data.startswith("data:image"):
            img_url = f"data:image/jpeg;base64,{image_data}"
            
        user_content = [
            {"type": "text", "text": prompt},
            {
                "type": "image_url", 
                "image_url": {
                    "url": img_url
                }
            }
        ]
        
        messages.append(HumanMessage(content=user_content))
        
        try:
            print(f"[OllamaVisionProvider] Analyzing with {model_name}...")
            response = await chat.ainvoke(messages)
            return response.content
        except Exception as e:
            print(f"[OllamaVisionProvider] Error: {e}")
            return f"Error analyzing image with Ollama: {str(e)}"

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
        # 1. Check if model matches an active local preset in config
        active_preset = config_service.get_active_preset()
        if active_preset and active_preset.get("model_name") == model_name:
             if active_preset.get("type") == "local":
                 return self._providers["ollama"]
             # If remote, fall through to provider check or default to OpenAI
        
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
        print(f"\n[VisionService] Request received for model: '{model_name}'")
        provider = self._get_provider(model_name)
        provider_name = "Ollama" if isinstance(provider, OllamaVisionProvider) else "OpenAI"
        print(f"[VisionService] Routing to provider: {provider_name}")
        
        # Log approximate image size to verify cropping
        img_len = len(image_data)
        print(f"[VisionService] Image Payload Size: {img_len} chars (approx {img_len * 3 / 4 / 1024:.1f} KB)")
        if img_len > 1000000:
             print("[VisionService] Payload > 1MB. Likely full image or large crop.")
        else:
             print("[VisionService] Payload < 1MB. Likely a cropped region.")

        return await provider.analyze_image(
            image_data=image_data, 
            prompt=prompt, 
            system_prompt=system_prompt, 
            model_name=model_name
        )

# Singleton instance
vision_service = VisionService()
