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
from app.services.agent_primitives.planner import PlannerPrimitive
from app.services.agent_primitives.compiler import CompilerPrimitive
from app.services.agent_primitives.auditor import AuditorPrimitive
from app.services.agent_primitives.refiner import RefinerPrimitive
from app.services.agent_primitives.structured_template_primitive import StructuredTemplatePrimitive
from app.services.agent_primitives.canvas_primitives import (
    CanvasSetPropertyPrimitive,
    CanvasMovePrimitive,
    CanvasLinkPrimitive,
    CanvasMoveToZonePrimitive,
    CanvasMoveToCanvasPrimitive
)
from app.services.agent_primitives.logic_primitives import (
    LogicIfElsePrimitive,
    CanvasQueryPrimitive,
    CanvasCreateLinkPrimitive
)
from app.services.agent_primitives.pipeline_primitive import GenericPipelinePrimitive

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
    "PLANNER": PlannerPrimitive,
    "COMPILER": CompilerPrimitive,
    "AUDITOR": AuditorPrimitive,
    "REFINER": RefinerPrimitive,
    "STRUCTURED_TEMPLATE": StructuredTemplatePrimitive,
    # Canvas Automations
    "CANVAS_SET_PROPERTY": CanvasSetPropertyPrimitive,
    "CANVAS_MOVE": CanvasMovePrimitive,
    "CANVAS_LINK": CanvasLinkPrimitive, # Legacy basic link
    "CANVAS_MOVE_TO_ZONE": CanvasMoveToZonePrimitive,
    "CANVAS_MOVE_TO_CANVAS": CanvasMoveToCanvasPrimitive,
    "EXECUTE_PIPELINE": GenericPipelinePrimitive,
    # Logic & Advanced Canvas
    "LOGIC_IF_ELSE": LogicIfElsePrimitive,
    "CANVAS_QUERY": CanvasQueryPrimitive,
    "CANVAS_CREATE_LINK": CanvasCreateLinkPrimitive,
    # Legacy aliases
    "AGENT": LLMGenerationPrimitive,
    "ANALYZER": LLMGenerationPrimitive,
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

