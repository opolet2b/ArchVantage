"""
Base Primitive

Abstract base class for all agent primitives. Each primitive must implement
the execute method and define its parameter schema.
"""
from abc import ABC, abstractmethod
from typing import Any, Dict, Optional, List, Union, cast
from pydantic import BaseModel
import re
import json


class PrimitiveResult(BaseModel):
    """Result returned by a primitive execution."""
    success: bool
    output: Any = None
    error: Optional[str] = None
    next_node: Optional[str] = None  # For conditional branching


class BasePrimitive(ABC):
    """
    Abstract base class for all primitives.
    
    Primitives are atomic execution units that perform a specific task.
    They are stateless and deterministic - given the same inputs, they
    produce the same outputs.
    """
    
    @property
    @abstractmethod
    def name(self) -> str:
        """Return the primitive type name (e.g., 'HTTP_REQUEST')."""
        pass
    
    @property
    @abstractmethod
    def description(self) -> str:
        """Return a description of what this primitive does."""
        pass
    
    @property
    @abstractmethod
    def param_schema(self) -> Dict[str, Any]:
        """
        Return JSON Schema for the primitive's parameters.
        
        This is used for validation and documentation.
        """
        pass
    
    @abstractmethod
    async def execute(
        self, 
        params: Dict[str, Any], 
        state: Dict[str, Any]
    ) -> PrimitiveResult:
        """
        Execute the primitive with given parameters and state.
        
        Args:
            params: Primitive-specific parameters (from node.params)
            state: Current execution state (variables, history, etc.)
            
        Returns:
            PrimitiveResult with success status, output, and optional error
        """
        pass
    
    def _log_debug(self, message: str, state: Dict[str, Any], extra: Optional[Dict[str, Any]] = None) -> None:
        """Helper to log debug information to file, console, and UI."""
        import os
        import json
        from datetime import datetime
        import asyncio
        
        timestamp = datetime.now().isoformat()
        log_entry = f"[{timestamp}] [{self.name}] {message}"
        if extra:
            log_entry += f" | DATA: {json.dumps(extra)}"
        
        # 1. Server Console
        print(log_entry)
        
        # 2. Write to debug file
        try:
            with open("execution_debug.log", "a", encoding="utf-8") as f:
                f.write(log_entry + "\n")
        except:
            pass

        # 3. Trigger UI callback if available
        if state and "status_callbacks" in state:
            callbacks = state["status_callbacks"]
            if callbacks:
                try:
                    # Try to get existing loop or create one if needed (usually exists in main thread)
                    try:
                        loop = asyncio.get_event_loop()
                    except RuntimeError:
                        loop = asyncio.new_event_loop()
                        asyncio.set_event_loop(loop)
                        
                    for cb in callbacks:
                        if asyncio.iscoroutinefunction(cb):
                            if loop.is_running():
                                loop.create_task(cb(log_entry))
                            else:
                                loop.run_until_complete(cb(log_entry))
                        else:
                            cb(log_entry)
                except Exception as e:
                    print(f"[BasePrimitive] Failed to trigger UI callback: {e}")

    def resolve_variables(
        self, 
        template: str, 
        state: Dict[str, Any]
    ) -> Any:
        """
        Resolve variable references in a template string.
        
        Variables are referenced as {{variable_name}} and are replaced
        with their values from the state.
        
        Args:
            template: String potentially containing variable references
            state: Current state containing variable values
            
        Returns:
            String with variables replaced by their values, OR the raw
            object if the template is exactly one variable reference.
        """
        import re
        
        # If already resolved (not a string), return as is
        if not isinstance(template, str):
            return template

        # Check for full match (exact variable reference) to return raw objects
        full_match = re.match(r'^\s*\{\{([^}]+)\}\}\s*$', template)
        if full_match:
            var_path = full_match.group(1).strip()
            val = self._resolve_single_variable(var_path, state)
            if val is not None:
                return val

        def replace_var(match):
            var_path = match.group(1).strip()
            val = self._resolve_single_variable(var_path, state)
            if val is None:
                variables = state.get("variables", {})
                available = list(variables.keys())
                self._log_debug(f"Variable NOT FOUND: '{var_path}'. Available keys: {available}", state)
            return str(val) if val is not None else ""
            
        pattern = r'\{\{([^}]+)\}\}'
        result = re.sub(pattern, replace_var, template)
        return result

    def _ensure_id(self, val: Any) -> Any:
        """
        Safely extract an ID from a resolved value.
        Handles cases where loop items (dictionaries) are passed directly.
        """
        if val is None:
            return None
            
        # If it's a list, take the first element (common for query_results)
        if isinstance(val, list):
            if not val:
                return None
            val = val[0]
            
        # If it's a dictionary (like a loop item), extract the 'id' field
        if isinstance(val, dict):
            return val.get("id") or val.get("thing_id") or val.get("domain_id")
            
        return val

    def _resolve_single_variable(self, var_path: str, state: Dict[str, Any]) -> Any:
        """Helper to resolve a single variable path to its value."""
        # ------------------------------------------------------------------
        # Lazy Loading: Domain Context
        # ------------------------------------------------------------------
        if var_path in ["domain_content", "domain_items", "domain_text"]:
            db = state.get("db")
            variables = state.get("variables", {})
            domain_id = variables.get("source_domain_id") or variables.get("domain_id")
            
            if db and domain_id:
                try:
                    from app.models.canvas_models import CanvasThing
                    things = db.query(CanvasThing).filter(CanvasThing.domain_id == domain_id).all()
                    
                    if var_path == "domain_items":
                        res = []
                        for t in things:
                            res.append({
                                "id": t.id, 
                                "type": t.type.value if hasattr(t.type, 'value') else str(t.type),
                                "content": t.content
                            })
                        return res
                        
                    else: # domain_content or domain_text
                        lines = [f"Context from Domain ({domain_id}):"]
                        for t in things:
                            t_type = t.type.value if hasattr(t.type, 'value') else str(t.type)
                            content_preview = ""
                            if t_type == "text":
                                content_preview = t.content.get("text", "")
                            elif t_type == "document":
                                content_preview = f"Document: {t.content.get('filename')} - {t.content.get('content', '')[:500]}..."
                            else:
                                content_preview = str(t.content)[:200]
                            lines.append(f"- [{t_type}] {content_preview}")
                        return "\n".join(lines)
                except Exception as e:
                    print(f"[_resolve_single_variable] Failed to fetch domain context: {e}")
                    return None

        # ------------------------------------------------------------------
        # Specific Reference: {{domain:UUID}} or {{thing:UUID}}
        # ------------------------------------------------------------------
        if var_path.startswith("domain:") or var_path.startswith("thing:"):
            try:
                ref_type, ref_id = var_path.split(":", 1)
                ref_id = ref_id.strip()
                db = state.get("db")
                if db:
                    from app.models.canvas_models import CanvasThing
                    if ref_type == "domain":
                        things = db.query(CanvasThing).filter(CanvasThing.domain_id == ref_id).all()
                        if not things: return None
                        lines = [f"Context from Domain ({ref_id}):"]
                        for t in things:
                            t_type = t.type.value if hasattr(t.type, 'value') else str(t.type)
                            content_preview = t.content.get("text", "") if t_type == "text" else str(t.content)[:200]
                            lines.append(f"- [{t_type}] {content_preview}")
                        return "\n".join(lines)
                    elif ref_type == "thing":
                        t = db.query(CanvasThing).filter(CanvasThing.id == ref_id).first()
                        if not t: return None
                        t_type = t.type.value if hasattr(t.type, 'value') else str(t.type)
                        return t.content.get("text", "") if t_type == "text" else t.content
            except Exception:
                return None

        # Strip path once for all resolution logic
        var_path = var_path.strip()

        # ------------------------------------------------------------------
        # Standard Resolution
        # ------------------------------------------------------------------
        # Determine root: explicit prefix or fallback to variables/inputs
        is_prefixed = any(var_path.startswith(p) for p in ["variables.", "inputs.", "secrets.", "variables[", "inputs[", "secrets["])
        
        if is_prefixed:
            root = state
        else:
            # If no prefix, try variables first, then fall back to inputs
            variables = state.get("variables", {})
            inputs = state.get("inputs", {})
            
            # Extract the first part of the path to check existence
            # Handle dots or brackets
            first_part = re.split(r'\.|\[', var_path)[0]
            
            if first_part in variables:
                root = variables
            elif first_part in inputs:
                root = inputs
            else:
                root = variables # Default to variables root

        try:
            val = self._get_nested_value(root, var_path)
            
            # --- AUTO-UNWRAP JSON STRINGS ---
            # If the resolved value is a string that looks like JSON, parse it.
            if isinstance(val, str):
                trimmed = val.strip()
                if (trimmed.startswith("{") and trimmed.endswith("}")) or (trimmed.startswith("[") and trimmed.endswith("]")):
                    try:
                        val = json.loads(trimmed)
                    except:
                        pass # Not valid JSON
            
            # --- AUTO-UNWRAP 'result' wrapper ---
            if isinstance(val, dict) and "result" in val and len(val) == 1:
                val = val["result"]
                
            if val is not None:
                return val
        except (KeyError, IndexError, TypeError):
            pass

        # ------------------------------------------------------------------
        # DEEP RECURSIVE SEARCH FALLBACK
        # ------------------------------------------------------------------
        # If direct path resolution failed, and this is a simple identifier (no dots/brackets),
        # perform a deep hunt across the entire state.
        if "." not in var_path and "[" not in var_path:
            # Search inputs and variables
            for source in [state.get("inputs", {}), state.get("variables", {})]:
                found = self._find_key_recursive(source, var_path)
                if found is not None:
                    return found
        
        return None
    
    def _get_nested_value(self, data: Dict, path: str) -> Any:
        """
        Get a value from nested data using dot notation.
        
        Supports:
        - Recursive JSON parsing: if an intermediate value is a string, it parses it to continue traversal.
        - Simple paths: "name"
        - Nested paths: "user.name"
        - Array access: "items[0]"
        - Secret access: "secrets.API_KEY"
        - Fuzzy key matching: handles underscore/dash mismatches in node IDs
        """
        parts = re.split(r'\.|(?=\[)', path)
        parts = [p for p in parts if p]
        
        current = data
        for part in parts:
            # --- RECURSIVE JSON PARSING ---
            # If current is a string (e.g. from an HTTP response), try to parse it 
            # so we can continue traversing into it.
            if isinstance(current, str):
                trimmed = current.strip()
                if (trimmed.startswith("{") and trimmed.endswith("}")) or (trimmed.startswith("[") and trimmed.endswith("]")):
                    try:
                        current = json.loads(trimmed)
                    except:
                        pass # Not valid JSON, keep as string (traversal will fail below)

            # Handle bracket notation: ['key'] or [0]
            bracket_match = re.match(r'\[([^\]]+)\]', part)
            if bracket_match:
                key = bracket_match.group(1).strip("\"'")
                if isinstance(current, dict):
                    current = self._fuzzy_dict_get(current, key)
                elif isinstance(current, list) and key.isdigit():
                    current = current[int(key)]
                else:
                    raise KeyError(f"Cannot access '{key}' in {type(current)}")
            else:
                # Regular dot notation
                if isinstance(current, dict):
                    current = self._fuzzy_dict_get(current, part)
                elif isinstance(current, list) and part.isdigit():
                    current = current[int(part)]
                else:
                    raise KeyError(f"Cannot access '{part}' in {type(current)}")
        
        return current

    def _find_key_recursive(self, obj: Any, target_key: str) -> Any:
        """
        Search for a key recursively in a structure, including stringified JSON.
        """
        if isinstance(obj, dict):
            # Check fuzzy match for immediate children
            res = self._fuzzy_dict_get(obj, target_key)
            if res is not None:
                return res
            
            # Recurse into values
            for v in obj.values():
                res = self._find_key_recursive(v, target_key)
                if res is not None:
                    return res
                    
        elif isinstance(obj, list):
            for item in obj:
                res = self._find_key_recursive(item, target_key)
                if res is not None:
                    return res
                    
        elif isinstance(obj, str):
            # Check if it's a JSON string
            trimmed = obj.strip()
            if (trimmed.startswith("{") and trimmed.endswith("}")) or (trimmed.startswith("[") and trimmed.endswith("]")):
                try:
                    parsed = json.loads(trimmed)
                    return self._find_key_recursive(parsed, target_key)
                except:
                    pass
        
        return None
    
    def _fuzzy_dict_get(self, data: Dict, key: str) -> Any:
        """
        Get a value from a dictionary with fuzzy key matching.
        
        Handles cases where the key uses underscores but the dict key uses
        dashes (or vice versa), which is common with node IDs.
        """
        import re
        
        # 1. Direct match first (fast path)
        if key in data:
            return data[key]
        
        # 2. Fuzzy match: normalize both and compare
        # This handles call_tool_ID vs call-tool-ID vs call_tool-ID
        if not key: return None
        normalized_key = re.sub(r'[_\-]', '', str(key)).lower()
        
        for dict_key in data.keys():
            # Skip non-string keys to avoid TypeError in regex
            if not isinstance(dict_key, str):
                continue
                
            if re.sub(r'[_\-]', '', dict_key).lower() == normalized_key:
                return data[dict_key]
        
        # 3. No match found

    def get_llm_config(self, state: Dict[str, Any], params: Dict[str, Any] = None) -> str:
        """
        Get the configured LLM model name with fallback logic.
        
        Priority:
        1. 'model' in variables (Global override injected by UI Dropdown)
        2. 'model' in params (Node-specific override if not "default")
        3. Canvas owner_config (Database lookup)
        4. Default fallback (settings.DEFAULT_LLM_MODEL)
        
        All candidates are resolved via llm_service.resolve_model_name to identify
        the specific configuration to be used.
        """
        params = params or {}
        variables = state.get("variables", {})
        candidate = None
        
        # 1. Overrides
        global_model = variables.get("model")
        param_model = params.get("model")
        
        print(f"[DEBUG_MODELS] Resolving config. Global: {global_model}, Param: {param_model}")
        
        if global_model:
            candidate = global_model
            print(f"[DEBUG_MODELS] Using global override: {candidate}")
        elif param_model and param_model != "default":
            candidate = param_model
            print(f"[DEBUG_MODELS] Using param override: {candidate}")
        
        # 2. Canvas Config (DB Lookup)
        if not candidate:
            canvas_id = state.get("canvas_id") or variables.get("canvas_id")
            db = state.get("db")
            if db and canvas_id:
                try:
                    from app.models.canvas_models import Canvas
                    canvas = db.query(Canvas).filter(Canvas.id == canvas_id).first()
                    if canvas and canvas.owner_config:
                        candidate = canvas.owner_config.get("llm_model") or canvas.owner_config.get("model")
                        print(f"[DEBUG_MODELS] Using canvas config: {candidate}")
                except Exception as e:
                    print(f"[BasePrimitive] Config lookup failed: {e}")
        
        # 3. Final Fallback
        if not candidate:
            from app.core.config import settings
            candidate = settings.DEFAULT_LLM_MODEL or "default"
            print(f"[DEBUG_MODELS] Using final fallback: {candidate}")
            
        # identification: use LLMService to resolve to a specific preset
        try:
            from app.services.llm_service import llm_service
            return llm_service.resolve_model_name(candidate)
        except Exception:
            return candidate
