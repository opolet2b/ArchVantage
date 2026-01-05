import os
from typing import List, Optional
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage, BaseMessage
from langchain_openai import ChatOpenAI
from langchain_anthropic import ChatAnthropic
from langchain_ollama import ChatOllama
from app.models.chat import Message

class LLMService:
    def __init__(self):
        # Initialize models (lazy loading or on demand could be better, but this is simple)
        # Ensure API keys are set in environment variables for cloud models
        pass

    def _get_model(self, model_name: str):
        if not model_name:
            model_name = "default"

        from app.services.config_service import config_service
        
        preset = None
        if model_name == "default":
            preset = config_service.get_default_llm_preset()
        else:
            # Check if model_name matches a saved preset
            config = config_service.get_config()
            presets = config.get("presets", [])
            preset = next((p for p in presets if p["name"] == model_name), None)

        if preset:
            if preset["type"] == "local":
                # Assumes Ollama
                return ChatOllama(model=preset["model_name"], base_url="http://localhost:11434")
            elif preset["type"] == "remote":
                # Generic OpenAI-compatible client
                model_kwargs = {}
                sort_strategy = preset.get("sort")
                if sort_strategy:
                    # OpenRouter specific: pass provider sort strategy in extra_body
                    model_kwargs["extra_body"] = {
                        "provider": {
                            "sort": sort_strategy
                        }
                    }

                return ChatOpenAI(
                    model=preset.get("model_name") or "gpt-3.5-turbo", 
                    openai_api_key=preset.get("service_api_key"),
                    openai_api_base=preset.get("api_url"),
                    model_kwargs=model_kwargs
                )

        if model_name.startswith("gpt"):
            return ChatOpenAI(model=model_name, temperature=0.7)
        elif model_name.startswith("claude"):
            return ChatAnthropic(model=model_name, temperature=0.7)
        elif model_name.startswith("ollama"):
            # Assumes Ollama is running locally on default port
            model_id = model_name.replace("ollama/", "")
            return ChatOllama(model=model_id)
        elif model_name.startswith("openrouter"):
             return ChatOpenAI(
                model=model_name.replace("openrouter/", ""),
                openai_api_key=os.getenv("OPENROUTER_API_KEY"),
                openai_api_base="https://openrouter.ai/api/v1",
            )
        else:
            # Default fallback
            return ChatOpenAI(model="gpt-3.5-turbo")

    def _convert_messages(self, messages: List[Message]) -> List[BaseMessage]:
        converted = []
        for msg in messages:
            if msg.role == "user":
                converted.append(HumanMessage(content=msg.content))
            elif msg.role == "assistant":
                converted.append(AIMessage(content=msg.content))
            elif msg.role == "system":
                converted.append(SystemMessage(content=msg.content))
        return converted

    async def chat(self, messages: List[Message], model_name: str = "gpt-3.5-turbo", **kwargs) -> str:
        try:
            llm = self._get_model(model_name)
            
            # Handle JSON mode request
            # canvas.py sends response_format={"type": "json_object"}
            if kwargs.get("response_format") == {"type": "json_object"}:
                 # Try to apply JSON mode if supported
                 if isinstance(llm, ChatOpenAI):
                      llm = llm.bind(response_format={"type": "json_object"})
                 elif isinstance(llm, ChatOllama):
                      llm = llm.bind(format="json")
            
            # Remove response_format from kwargs to avoid passing it to ainvoke (which might be strict)
            kwargs.pop("response_format", None)

            langchain_messages = self._convert_messages(messages)
            response = await llm.ainvoke(langchain_messages, **kwargs)
            return response.content
        except Exception as e:
            print(f"Error in LLMService: {e}")
            return f"Error: {str(e)}"

llm_service = LLMService()
