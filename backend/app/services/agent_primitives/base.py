"""
Base Primitive

Abstract base class for all agent primitives. Each primitive must implement
the execute method and define its parameter schema.
"""
from abc import ABC, abstractmethod
from typing import Any, Dict, Optional
from pydantic import BaseModel


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
    
    def resolve_variables(
        self, 
        template: str, 
        state: Dict[str, Any]
    ) -> str:
        """
        Resolve variable references in a template string.
        
        Variables are referenced as {{variable_name}} and are replaced
        with their values from the state.
        
        Args:
            template: String potentially containing variable references
            state: Current state containing variable values
            
        Returns:
            String with variables replaced by their values
        """
        import re
        
        # Get the variables dict from state - this is where actual values are stored
        variables = state.get("variables", {})
        
        print(f"[DEBUG resolve_variables] Template: {template[:100]}...")
        print(f"[DEBUG resolve_variables] Variables keys: {list(variables.keys())[:10]}...")  # First 10 keys
        
        
        # Determine root for resolution
        # If the path explicitly accesses "variables", we should resolve from state options
        # But for backward compatibility we also want direct access to variables
        
        # Robust Context Construction
        # We can't really merge state and variables blindly if there are conflicts.
        # But our resolve logic uses a specific "root" object.
        
        def replace_var(match):
            var_path = match.group(1).strip()
            print(f"[DEBUG resolve_variables] Resolving variable: {var_path}")
            
            # Determine Context
            if var_path.startswith("variables") or var_path.startswith("inputs") or var_path.startswith("secrets"):
                 root = state
            else:
                 root = state.get("variables", {})
            
            # Support nested access like "data.items[0].name"
            try:
                # Search in appropriate root
                value = self._get_nested_value(root, var_path)
                print(f"[DEBUG resolve_variables] Resolved '{var_path}' -> '{str(value)[:50]}...'")
                return str(value) if value is not None else ""
            except (KeyError, IndexError, TypeError) as e:
                print(f"[DEBUG resolve_variables] Failed to resolve '{var_path}': {e}")
                # print(f"[DEBUG resolve_variables] Available keys: {list(root.keys())}") 
                # (Commented out to avoid log spam if root is huge)
                return match.group(0)  # Keep original if not found
        
        pattern = r'\{\{([^}]+)\}\}'
        result = re.sub(pattern, replace_var, template)
        print(f"[DEBUG resolve_variables] Result: {result[:100]}...")
        return result
    
    def _get_nested_value(self, data: Dict, path: str) -> Any:
        """
        Get a value from nested data using dot notation.
        
        Supports:
        - Simple paths: "name"
        - Nested paths: "user.name"
        - Array access: "items[0]"
        - Secret access: "secrets.API_KEY"
        - Fuzzy key matching: handles underscore/dash mismatches in node IDs
        """
        import re
        
        parts = re.split(r'\.|(?=\[)', path)
        # Filter empty strings
        parts = [p for p in parts if p]
        
        current = data
        for part in parts:
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
        raise KeyError(f"Key '{key}' not found in dictionary")
