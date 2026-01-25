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
            
            # If not found by name, try fallback search by model_id if applicable
            if not preset:
                preset = next((p for p in presets if p.get("model_name") == model_name), None)

        # Fallback to default if no preset found for given name
        if not preset and model_name != "default":
             preset = config_service.get_default_llm_preset()
             if preset:
                 print(f"[LLMService] Warning: Requested model '{model_name}' not found. Falling back to default preset '{preset['name']}'.")

        if preset:
            if preset.get("type") == "local":
                # Assumes Ollama
                return ChatOllama(model=preset["model_name"], base_url="http://localhost:11434")
            elif preset.get("type") == "remote":
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

        # Hardcoded fallbacks if no presets match
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
            # Final fallback
            print(f"[LLMService] No preset or pattern match for '{model_name}'. Falling back to GPT-3.5-Turbo.")
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

    async def generate_title(self, content: str, type: str = "conversation") -> str:
        """Generates a short 3-5 word title for the given content."""
        try:
            llm = self._get_model("default")
            
            prompt = f"""
            Generate a short, concise title (3-5 words) for the following {type}.
            Do not use quotes or prefixes like "Title:". Just the title.
            
            Content:
            {content[:2000]} 
            """
            
            response = await llm.ainvoke([HumanMessage(content=prompt)])
            title = response.content.strip().replace('"', '')
            return title
        except Exception as e:
            print(f"Error generating title: {e}")
            return "New " + type.capitalize()

    def _extract_json(self, text: str) -> str:
        """Extracts JSON block from a string that might contain other text."""
        import re
        
        # Try to find JSON block between triple backticks
        mj = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", text)
        if mj:
            return mj.group(1).strip()
            
        # Try to find anything between first { and last }
        m = re.search(r"(\{[\s\S]*\})", text)
        if m:
            return m.group(1).strip()
            
        return text.strip()

    async def generate_zoom_summaries(self, content: str, model_name: str = "default") -> dict:
        """
        Generates 4 levels of summaries for semantic zoom.
        Returns a dict with keys: label, one_line, sentence, paragraph.
        """
        try:
            llm = self._get_model(model_name)
            
            # Specialized prompt for JSON output
            prompt = f"""
            Analyze the following content and generate four levels of summary for a spatial canvas interface:
            
            1. "label": Hyper-concise subject distillation (3-5 words).
            2. "one_line": A high-level, headlines-style summary (10-15 words).
            3. "sentence": A single comprehensive sentence (20-30 words).
            4. "paragraph": A short details-rich summary (2-3 sentences).
            
            Return ONLY a JSON object with these four keys: "label", "one_line", "sentence", "paragraph".
            Do not include any other text or markdown formatting.
            
            Content:
            {content[:4000]}
            """
            
            import json
            response_text = await self.chat(
                [Message(role="user", content=prompt)], 
                model_name=model_name,
                response_format={"type": "json_object"}
            )
            
            print(f"[LLMService] Zoom summary raw response: {response_text[:200]}...")
            
            content_to_parse = self._extract_json(response_text)
            
            if not content_to_parse:
                raise ValueError("Could not extract any content from LLM response")

            if content_to_parse.startswith("Error:"):
                raise ValueError(content_to_parse)

            try:
                # Use strict=False to allow control characters (like newlines) in strings
                summaries = json.loads(content_to_parse, strict=False)
            except json.JSONDecodeError as je:
                print(f"[LLMService] JSON parse failed on: {content_to_parse[:200]}")
                # Fallback: if it's not JSON, just return it as a single paragraph summary
                return {
                    "label": "Analysis active",
                    "one_line": "AI summary in progress...",
                    "sentence": "The AI is processing the content but returned a non-standard format.",
                    "paragraph": content_to_parse[:500]
                }
            
            # Ensure all keys exist
            required_keys = ["label", "one_line", "sentence", "paragraph"]
            for key in required_keys:
                if key not in summaries:
                    summaries[key] = f"Summary level {key} unavailable."
                    
            return summaries
        except Exception as e:
            print(f"Error in generate_zoom_summaries: {e}")
            import traceback
            traceback.print_exc()
            return {
                "label": "Analysis failed",
                "one_line": "Could not generate summaries.",
                "sentence": f"Error: {str(e)}",
                "paragraph": "Check your model configuration and connectivity."
            }

llm_service = LLMService()
