import logging
from typing import Callable, Awaitable, Any, Dict

logger = logging.getLogger(__name__)

class PluginRegistry:
    _analyzers: Dict[str, Callable[..., Awaitable[Any]]] = {}

    @classmethod
    def register_analyzer(cls, thing_type: str):
        """
        Decorator to register a custom analyzer function for a specific thing type.
        """
        def decorator(func: Callable[..., Awaitable[Any]]):
            logger.info(f"Registering custom analyzer for thing type: {thing_type}")
            cls._analyzers[thing_type] = func
            return func
        return decorator

    @classmethod
    def get_analyzer(cls, thing_type: str) -> Callable[..., Awaitable[Any]] | None:
        """
        Returns the registered analyzer for the given thing type, or None if not found.
        """
        return cls._analyzers.get(thing_type)
