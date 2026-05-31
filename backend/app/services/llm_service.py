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

    def _resolve_preset(self, model_name: str):
        if not model_name:
            model_name = "default"

        print(f"[LLM_SERVICE] Resolving preset for: {model_name}")
        if model_name == "default":
            import traceback
            print("--- TRACE: Who called for 'default' model? ---")
            # Print a concise stack trace to identify the caller
            traceback.print_stack(limit=6)
            print("----------------------------------------------")

        from app.services.config_service import config_service
        
        preset = None
        if model_name == "default":
            preset = config_service.get_default_llm_preset()
            print(f"[LLM_SERVICE] Result for 'default': {preset.get('name') if preset else 'None'}")
        else:
            # Check if model_name matches a saved preset
            config = config_service.get_config()
            presets = config.get("presets", [])
            preset = next((p for p in presets if p["name"] == model_name), None)
            
            # If not found by name, try fallback search by model_id if applicable
            if not preset:
                preset = next((p for p in presets if p.get("model_name") == model_name), None)

        # Determine final resolve
        if preset:
            print(f"[LLM_SERVICE] Final Resolved Preset: {preset.get('name')} (Model ID: {preset.get('model_name')})")
        else:
            print(f"[LLM_SERVICE] No preset found for '{model_name}'. Proceeding with raw identifier.")

        return preset

    def resolve_model_name(self, model_name: str) -> str:
        """Resolves a model name/identifier to its preset display name."""
        preset = self._resolve_preset(model_name)
        return preset.get("name") if preset else model_name

    def _get_model(self, model_name: str):
        """
        Identify the corresponding model and use it based on settings configuration.
        Returns a tuple of (langchain_model, resolved_display_name).
        """
        preset = self._resolve_preset(model_name)
        resolved_name = preset.get("name") if preset else model_name

        if preset:
            # Identify the actual model name to use for the provider from settings
            target_model_id = preset.get("model_name") or "gpt-3.5-turbo"
            
            if preset.get("type") == "local":
                from langchain_ollama import ChatOllama
                ollama_url = preset.get("api_url") or "http://localhost:11434"
                return ChatOllama(model=target_model_id, base_url=ollama_url), resolved_name
            else:
                # Generic OpenAI-compatible client (remote or default)
                from langchain_openai import ChatOpenAI
                model_kwargs = {}
                sort_strategy = preset.get("sort")
                if sort_strategy:
                    model_kwargs["extra_body"] = {"provider": {"sort": sort_strategy}}

                return ChatOpenAI(
                    model=target_model_id, 
                    openai_api_key=preset.get("service_api_key"),
                    openai_api_base=preset.get("api_url"),
                    model_kwargs=model_kwargs
                ), resolved_name

        # Hardcoded pattern fallbacks (only if NO preset found)
        from langchain_openai import ChatOpenAI
        if model_name.startswith("gpt"):
            return ChatOpenAI(model=model_name, temperature=0.7), model_name
        elif model_name.startswith("claude"):
            from langchain_anthropic import ChatAnthropic
            return ChatAnthropic(model=model_name, temperature=0.7), model_name
        elif model_name.startswith("ollama"):
            from langchain_ollama import ChatOllama
            model_id = model_name.replace("ollama/", "")
            return ChatOllama(model=model_id), model_name
        elif model_name.startswith("openrouter"):
             return ChatOpenAI(
                model=model_name.replace("openrouter/", ""),
                openai_api_key=os.getenv("OPENROUTER_API_KEY"),
                openai_api_base="https://openrouter.ai/api/v1",
            ), model_name
        else:
            # Final system default if everything else fails
            print(f"[LLMService] No preset or pattern match for '{model_name}'. Falling back to GPT-3.5-Turbo.")
            return ChatOpenAI(model="gpt-3.5-turbo"), "gpt-3.5-turbo"

    def _get_llama_index_model(self, model_name: str):
        """Returns a LlamaIndex-native LLM object for the given model/preset."""
        preset = self._resolve_preset(model_name)
        
        window = 4096
        window = 4096
        if d_preset := preset:
            raw_window = d_preset.get("context_window", 4096)
            window = raw_window
            print(f"[LLMService] Creating LlamaIndex model '{model_name}' with context_window={window} (raw: {raw_window})")
            
            m_name = d_preset.get("model_name") or "gpt-3.5-turbo"
            api_url = preset.get("api_url") or ""
            
            if preset.get("type") == "local":
                # Detect if the local server is vLLM/LMStudio (OpenAI compatible) vs Ollama
                if api_url and ("/v1" in api_url or "8000" in api_url):
                    from llama_index.llms.openai_like import OpenAILike
                    return OpenAILike(
                        model=m_name,
                        api_key=preset.get("service_api_key") or "EMPTY",
                        api_base=api_url,
                        context_window=window,
                        is_chat_model=True,
                        timeout=300.0
                    )
                else:
                    from llama_index.llms.ollama import Ollama
                    ollama_url = api_url or "http://localhost:11434"
                    return Ollama(model=m_name, base_url=ollama_url, context_window=window, request_timeout=300.0)
            elif preset.get("type") == "remote":
                # Use OpenAI class ONLY for real OpenAI models to avoid name validation crashes
                is_openai = m_name.startswith("gpt-") or "api.openai.com" in api_url
                
                if is_openai:
                    from llama_index.llms.openai import OpenAI
                    return OpenAI(
                        model=m_name,
                        api_key=preset.get("service_api_key"),
                        api_base=api_url if api_url else None,
                        context_window=window
                    )
                else:
                    # For OpenRouter, Gemini, DeepSeek, etc. via OpenAI-compatible APIs
                    from llama_index.llms.openai_like import OpenAILike
                    return OpenAILike(
                        model=m_name,
                        api_key=preset.get("service_api_key"),
                        api_base=api_url,
                        context_window=window,
                        is_chat_model=True,
                        timeout=300.0
                    )
        
        # Fallbacks for LlamaIndex
        if model_name.startswith("ollama"):
            from llama_index.llms.ollama import Ollama
            model_id = model_name.replace("ollama/", "")
            return Ollama(model=model_id)
        elif model_name.startswith("openrouter") or "/" in model_name:
            # If it has a slash, it's likely a provider/model pair (OpenRouter style)
            from llama_index.llms.openai_like import OpenAILike
            m_id = model_name.replace("openrouter/", "")
            return OpenAILike(
                model=m_id,
                api_key=os.getenv("OPENROUTER_API_KEY"),
                api_base="https://openrouter.ai/api/v1",
                is_chat_model=True
            )
        
        from llama_index.llms.openai import OpenAI
        return OpenAI(model="gpt-3.5-turbo")

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

    async def chat(self, messages: List[Message], model_name: str = "gpt-3.5-turbo", strip_think: bool = True, **kwargs) -> str:
        try:
            llm, resolved_name = self._get_model(model_name)
            
            # Handle JSON mode and Temperature for Ollama
            # canvas.py sends response_format={"type": "json_object"}
            if kwargs.get("response_format") == {"type": "json_object"}:
                 # Try to apply JSON mode if supported
                 if isinstance(llm, ChatOpenAI):
                      llm = llm.bind(response_format={"type": "json_object"})
                 elif isinstance(llm, ChatOllama):
                      llm = llm.bind(format="json")
            
            # Special handling for ChatOllama: temperature must be bound, not passed in invoke kwargs
            if isinstance(llm, ChatOllama) and "temperature" in kwargs:
                 temp = kwargs.pop("temperature")
                 llm = llm.bind(temperature=temp)

            # Remove response_format from kwargs to avoid passing it to ainvoke (which might be strict)
            kwargs.pop("response_format", None)

            langchain_messages = self._convert_messages(messages)
            
            # --- Robust LLM Call with Heartbeat ---
            import asyncio
            import time
            
            # Status Callback Helper
            async def trigger_callbacks(message: str):
                callbacks = kwargs.get("callbacks", [])
                if callbacks:
                    for cb in callbacks:
                        try:
                            if asyncio.iscoroutinefunction(cb):
                                await cb(message)
                            else:
                                cb(message)
                        except Exception as cbe:
                            print(f"[LLMService] Callback error: {cbe}")

            async def heartbeat(stop_event):
                start_time = time.time()
                while not stop_event.is_set():
                    await asyncio.sleep(30)
                    if not stop_event.is_set():
                        elapsed = time.time() - start_time
                        msg = f"Heartbeat: AI still working on '{resolved_name}'... [elapsed {elapsed:.0f}s]"
                        print(f"[LLMService] {msg}")
                        await trigger_callbacks(msg)

            stop_heartbeat = asyncio.Event()
            heartbeat_task = asyncio.create_task(heartbeat(stop_heartbeat))
            
            try:
                # Remove callbacks from kwargs before passing to LLM to avoid unexpected argument errors
                invoke_kwargs = {k: v for k, v in kwargs.items() if k != "callbacks"}
                
                # Increased Timeout: 600 seconds (10 minutes) for large extractions
                # Use to_thread if there's any risk of the library blocking the loop synchronously
                # response = await asyncio.wait_for(asyncio.to_thread(llm.invoke, langchain_messages, **invoke_kwargs), timeout=600.0)
                # However, ainvoke is generally preferred if supported.
                print(f"[LLMService] DEBUG: calling llm.ainvoke for '{resolved_name}'...")
                response = await asyncio.wait_for(
                    llm.ainvoke(langchain_messages, **invoke_kwargs),
                    timeout=600.0
                )
                
                # Post-processing: Remove <think> tags (Reasoning Models)
                import re
                content = response.content
                if strip_think:
                    if "<think>" in content:
                        content = re.sub(r"<think>.*?</think>", "", content, flags=re.DOTALL).strip()
                    elif "</think>" in content:
                        content = content.split("</think>", 1)[-1].strip()
                
                print(f"[LLMService] DEBUG: llm.ainvoke returned. Content len: {len(content) if content else 0}")
                
                # --- TEMPORARY DEBUG LOG ---
                try:
                    with open("raw_llm_response.log", "w", encoding="utf-8") as f:
                        f.write(f"MODEL: {model_name}\n")
                        f.write(f"RESPONSE CONTENT:\n{content}\n")
                except: pass
                
                return content
            except asyncio.TimeoutError:
                err_msg = f"CRITICAL: TimeoutError for '{model_name}' after 600s."
                print(f"[LLMService] {err_msg}")
                await trigger_callbacks(err_msg)
                return f"Error: The AI model ({model_name}) timed out after 10 minutes. The document might be too large or the provider is overloaded."
            finally:
                stop_heartbeat.set()
                await heartbeat_task
        except Exception as e:
            print(f"Error in LLMService: {e}")
            return f"Error: {str(e)}"

    async def generate_title(self, content: str, type: str = "conversation", model_name: str = "default") -> str:
        """Generates a short 3-5 word title for the given content."""
        try:
            print(f"!!! DEBUG llm_service.generate_title received model_name: '{model_name}'")
            llm, resolved_name = self._get_model(model_name)
            
            prompt = f"""
            Generate a short, concise title (3-5 words) for the following {type}.
            Do not use quotes or prefixes like "Title:". Just the title.
            
            Content:
            {content[:2000]} 
            """
            
            import re
            response = await llm.ainvoke([HumanMessage(content=prompt)])
            title = response.content.strip().replace('"', '')
            # Strip thinking tags if present
            title = re.sub(r'<think>[\s\S]*?</think>', '', title).strip()
            return title
        except Exception as e:
            print(f"Error generating title: {e}")
            return "New " + type.capitalize()

    async def chat_completion(self, system_prompt: str, user_prompt: str, model: str = "default", temperature: float = 0.7, json_mode: bool = False, **kwargs) -> str:
        """
        Simple wrapper for one-off chat completions.
        """
        from app.models.chat import Message
        
        messages = [
            Message(role="system", content=system_prompt),
            Message(role="user", content=user_prompt)
        ]
        
        full_response = ""
        # The chat method is an async generator, generic args handle config
        # Note: The existing `chat` method does not appear to be an async generator.
        # It returns a single string. The loop below will only run once.
        # If `chat` is intended to stream, its implementation needs to change.
        # For now, assuming it returns the full response directly.
        pass_kwargs = kwargs.copy()
        if json_mode:
            pass_kwargs["response_format"] = {"type": "json_object"}
            
        response_content = await self.chat(messages, model_name=model, temperature=temperature, **pass_kwargs)
        full_response = response_content
                
        return full_response

    def _extract_json(self, text: str) -> str:
        """Extracts JSON block from a string with automated repair for common LLM artifacts."""
        import re
        import json
        import ast
        from typing import List

        # 1. Primary Extraction: Try backticks first
        mj = re.search(r"```[^\n]*\n([\s\S]*?)```", text)
        if not mj:
            mj = re.search(r"```([\s\S]*?)```", text)
        content = mj.group(1).strip() if mj else text.strip()

        def find_balanced_candidates(s: str) -> List[str]:
            """
            Extract all balanced JSON object ({}) or array ([]) structures
            from the text by scanning with bracket matching and string tracking.
            """
            found_candidates = []
            # Gather all indexes of potential opening brackets/braces
            start_indices = [i for i, c in enumerate(s) if c in ('{', '[')]

            for start_idx in start_indices:
                start_char = s[start_idx]
                end_char = '}' if start_char == '{' else ']'

                depth = 0
                in_string = False
                escape = False
                string_char = None

                for j in range(start_idx, len(s)):
                    char = s[j]
                    if escape:
                        escape = False
                        continue
                    if char == '\\':
                        escape = True
                        continue
                    if in_string:
                        if char == string_char:
                            in_string = False
                        continue
                    if char in ('"', "'"):
                        in_string = True
                        string_char = char
                        continue

                    # If outside strings, track open/close matching depth
                    if char == start_char:
                        depth += 1
                    elif char == end_char:
                        depth -= 1
                        if depth == 0:
                            found_candidates.append(s[start_idx:j+1])
                            break
            return found_candidates

        def repair_json(s: str) -> str:
            """Attempts automatic syntax fixes for common LLM generation mistakes."""
            # Remove trailing commas in objects/arrays
            s = re.sub(r',\s*\}', '}', s)
            s = re.sub(r',\s*\]', ']', s)
            
            # Handle single-quoted property names and strings (Python-style dicts)
            if s.startswith("{") or s.startswith("["):
                # Basic single-to-double quote swap for dict keys
                s = re.sub(r"'(\w+)':", r'"\1":', s)
                # Swap remaining single quotes to double quotes if they act as delimiters
                s = re.sub(r"(?<=[\s\[\{\,])'|'(?=[\s\]\}\,])", '"', s)
            return s

        # Find all structural candidates using the balanced scanner
        candidates = find_balanced_candidates(content)
        
        # Include original parsed content as a fallback candidate
        if content not in candidates:
            candidates.append(content)
            
        # Include regex-based outermost match as a fallback candidate
        m_outer = re.search(r"(\{[\s\S]*\}|\[[\s\S]*\])", content)
        if m_outer:
            outer_match = m_outer.group(1).strip()
            if outer_match not in candidates:
                candidates.append(outer_match)

        # Sort by length descending so that we attempt to parse
        # the most complete outer-most structures first
        candidates.sort(key=len, reverse=True)

        for cand in candidates:
            # Attempt 1: Raw JSON parsing
            try:
                json.loads(cand, strict=False)
                return cand
            except Exception:
                pass
            
            # Attempt 2: Parsing after applying repairs
            repaired = repair_json(cand)
            try:
                json.loads(repaired, strict=False)
                print("[LLMService] JSON repaired successfully")
                return repaired
            except Exception:
                pass

            # Attempt 3: AST Fallback (evaluates Python literal structures safely)
            try:
                py_data = ast.literal_eval(cand)
                if isinstance(py_data, (dict, list)):
                    print("[LLMService] Parsed as Python literal successfully")
                    return json.dumps(py_data)
            except Exception:
                continue
                
        # If all valid parse attempts fail, return the best effort
        print(f"[LLMService] JSON extraction failed. Start: {text[:100]}...")
        return content

    async def generate_zoom_summaries(self, content: str, model_name: str = "default") -> dict:
        """
        Generates 4 levels of summaries for semantic zoom.
        Returns a dict with keys: label, one_line, sentence, paragraph.
        """
        try:
            llm, resolved_name = self._get_model(model_name)
            
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
            
            # The chat returns raw JSON or a string containing JSON. 
            # We use the _extract_json helper to be robust.
            json_str = self._extract_json(response_text)
            try:
                data = json.loads(json_str)
            except json.JSONDecodeError:
                print(f"[LLMService] Zoom summary JSON decode error. Output was: {response_text[:200]}")
                data = {}
            
            # Ensure all keys exist
            required = ["label", "one_line", "sentence", "paragraph"]
            for key in required:
                if key not in data:
                    data[key] = "Not available"
                    
            return data
            
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

    async def astream_chat(self, messages: List[Message], model_name: str = "gpt-3.5-turbo", **kwargs):
        """
        Stream the LLM chat tokens asynchronously.
        Useful for preventing HTTP 504 gateway timeouts on slow models.
        """
        try:
            llm, resolved_name = self._get_model(model_name)
            
            # Apply JSON mode if requested
            if kwargs.get("response_format") == {"type": "json_object"}:
                if hasattr(llm, "bind"):
                    if isinstance(llm, ChatOpenAI):
                        llm = llm.bind(response_format={"type": "json_object"})
                    elif isinstance(llm, ChatOllama):
                        llm = llm.bind(format="json")
            
            # Ollama temperature binding
            if isinstance(llm, ChatOllama) and "temperature" in kwargs:
                temp = kwargs.pop("temperature")
                llm = llm.bind(temperature=temp)

            # Cleanup kwargs
            kwargs.pop("response_format", None)
            langchain_messages = self._convert_messages(messages)
            
            invoke_kwargs = {k: v for k, v in kwargs.items() if k != "callbacks"}
            
            print(f"[LLMService] Streaming chat for model '{resolved_name}'...")
            
            # Stream chunk content
            async for chunk in llm.astream(langchain_messages, **invoke_kwargs):
                if hasattr(chunk, "content"):
                    yield chunk.content
                else:
                    yield str(chunk)
        except Exception as e:
            print(f"[LLMService] Error in astream_chat: {e}")
            raise e

llm_service = LLMService()

