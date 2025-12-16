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
        
        def replace_var(match):
            var_path = match.group(1).strip()
            # Support nested access like "data.items[0].name"
            try:
                value = self._get_nested_value(state, var_path)
                return str(value) if value is not None else ""
            except (KeyError, IndexError, TypeError):
                return match.group(0)  # Keep original if not found
        
        pattern = r'\{\{([^}]+)\}\}'
        return re.sub(pattern, replace_var, template)
    
    def _get_nested_value(self, data: Dict, path: str) -> Any:
        """
        Get a value from nested data using dot notation.
        
        Supports:
        - Simple paths: "name"
        - Nested paths: "user.name"
        - Array access: "items[0]"
        - Secret access: "secrets.API_KEY"
        """
        import re
        
        parts = re.split(r'\.|\[|\]', path)
        # Filter empty strings and strip quotes from keys like "key" or 'key'
        parts = [p.strip("\"'") for p in parts if p]
        
        current = data
        for part in parts:
            if isinstance(current, dict):
                current = current[part]
            elif isinstance(current, list) and part.isdigit():
                current = current[int(part)]
            else:
                raise KeyError(f"Cannot access '{part}' in {type(current)}")
        
        return current
