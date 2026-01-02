"""
Agent Primitives Package

This package contains the standard primitives library for the Agent Builder.
Each primitive is a safe, pre-coded block that the LLM can configure but not modify.
"""
from app.services.agent_primitives.base import BasePrimitive
from app.services.agent_primitives.start import StartPrimitive
from app.services.agent_primitives.end import EndPrimitive
from app.services.agent_primitives.http_request import HTTPRequestPrimitive
from app.services.agent_primitives.call_tool import CallToolPrimitive
from app.services.agent_primitives.condition import ConditionPrimitive
from app.services.agent_primitives.json_mapping import JSONMappingPrimitive
from app.services.agent_primitives.text_template import TextTemplatePrimitive
from app.services.agent_primitives.foreach import ForEachPrimitive
from app.services.agent_primitives.llm_decision import LLMDecisionPrimitive
from app.services.agent_primitives.extractor import ExtractorPrimitive
from app.services.agent_primitives.document_converter import DocumentConverterPrimitive
from app.services.agent_primitives.llm_generation import LLMGenerationPrimitive

# Registry of all available primitives
PRIMITIVE_REGISTRY = {
    "START": StartPrimitive,
    "END": EndPrimitive,
    "HTTP_REQUEST": HTTPRequestPrimitive,
    "CALL_TOOL": CallToolPrimitive,
    "CONDITION": ConditionPrimitive,
    "JSON_MAPPING": JSONMappingPrimitive,
    "TEXT_TEMPLATE": TextTemplatePrimitive,
    "FOREACH": ForEachPrimitive,
    "LLM_DECISION": LLMDecisionPrimitive,
    "DOCUMENT_CONVERTER": DocumentConverterPrimitive,
    "EXTRACTOR": ExtractorPrimitive,
    "LLM_GENERATION": LLMGenerationPrimitive,
    # Legacy aliases
    "AGENT": LLMGenerationPrimitive,
    "VISUALIZER": TextTemplatePrimitive,
    "VIZUALISER": TextTemplatePrimitive, # Handle potential typo
    "FORMATTER": TextTemplatePrimitive,
}


def get_primitive(primitive_type: str) -> BasePrimitive:
    """
    Get an instance of a primitive by type name.
    
    Args:
        primitive_type: The type of primitive (e.g., "HTTP_REQUEST")
        
    Returns:
        An instance of the primitive class
        
    Raises:
        ValueError: If the primitive type is not found
    """
    if primitive_type not in PRIMITIVE_REGISTRY:
        raise ValueError(f"Unknown primitive type: {primitive_type}")
    return PRIMITIVE_REGISTRY[primitive_type]()


__all__ = [
    "BasePrimitive",
    "StartPrimitive",
    "EndPrimitive",
    "HTTPRequestPrimitive",
    "CallToolPrimitive",
    "ConditionPrimitive",
    "JSONMappingPrimitive",
    "TextTemplatePrimitive",
    "ForEachPrimitive",
    "LLMDecisionPrimitive",
    "DocumentConverterPrimitive",
    "ExtractorPrimitive",
    "PRIMITIVE_REGISTRY",
    "get_primitive",
]

