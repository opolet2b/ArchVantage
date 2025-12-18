"""
Schema Discovery Service

Discovers input/output schemas for nodes in an agent graph.
Used by the JSON Mapping primitive to show available fields.
"""
from typing import Any, Dict, List, Optional
from sqlalchemy.orm import Session


def get_node_by_id(graph: Dict[str, Any], node_id: str) -> Optional[Dict]:
    """
    Find a node in the graph by its ID.
    
    Args:
        graph: The agent graph containing nodes and edges
        node_id: The ID of the node to find
        
    Returns:
        The node dict or None if not found
    """
    nodes = graph.get("nodes", [])
    for node in nodes:
        nid = node.get("id") if isinstance(node, dict) else getattr(node, "id", None)
        if nid == node_id:
            return node if isinstance(node, dict) else node.__dict__
    return None


def get_incoming_node_ids(graph: Dict[str, Any], target_node_id: str) -> List[str]:
    """
    Find all nodes that connect TO the target node.
    
    Args:
        graph: The agent graph
        target_node_id: The node receiving connections
        
    Returns:
        List of source node IDs
    """
    edges = graph.get("edges", [])
    incoming = []
    for edge in edges:
        edge_target = (
            edge.get("target") if isinstance(edge, dict) 
            else getattr(edge, "target", None)
        )
        edge_source = (
            edge.get("source") if isinstance(edge, dict) 
            else getattr(edge, "source", None)
        )
        if edge_target == target_node_id:
            incoming.append(edge_source)
    return incoming


def get_outgoing_node_ids(graph: Dict[str, Any], source_node_id: str) -> List[str]:
    """
    Find all nodes that the source node connects TO.
    
    Args:
        graph: The agent graph
        source_node_id: The node sending connections
        
    Returns:
        List of target node IDs
    """
    edges = graph.get("edges", [])
    outgoing = []
    for edge in edges:
        edge_source = (
            edge.get("source") if isinstance(edge, dict) 
            else getattr(edge, "source", None)
        )
        edge_target = (
            edge.get("target") if isinstance(edge, dict) 
            else getattr(edge, "target", None)
        )
        if edge_source == source_node_id:
            outgoing.append(edge_target)
    return outgoing


def get_tool_output_schema(db: Session, tool_id: int) -> Dict[str, Any]:
    """
    Get the output schema for a tool (MCP or GUI).
    
    Args:
        db: Database session
        tool_id: The tool ID
        
    Returns:
        Schema dict with fields array
    """
    from app.models.tools import Tool
    
    tool = db.query(Tool).filter(Tool.id == tool_id).first()
    if not tool:
        return {"fields": [], "error": f"Tool {tool_id} not found"}
    
    config = tool.configuration or {}
    fields = []
    
    # Check for GUI tool FIRST (check both tool_type and presence of gui_schema)
    is_gui_tool = (hasattr(tool, "tool_type") and tool.tool_type == "gui")
    has_gui_schema = "gui_schema" in config
    
    if is_gui_tool or has_gui_schema:
        gui_schema = config.get("gui_schema", {})
        # GUI tools store form components as either "fields" or "components"
        gui_fields = gui_schema.get("fields") or gui_schema.get("components") or []
        for field in gui_fields:
            field_name = field.get("id", field.get("name", ""))
            if field_name:
                fields.append({
                    "name": field_name,
                    "type": field.get("type", "string"),
                    "label": field.get("title", field.get("label", field_name)),
                })
        if fields:
            return {"fields": fields, "source": "gui_schema"}
    
    # Check for MCP tool with selected_functions
    selected_functions = config.get("selected_functions", [])
    if selected_functions:
        # MCP tools output comes from the function response
        # We can't know the exact output schema, but we can indicate it exists
        for func in selected_functions:
            # Add function name as potential output
            fields.append({
                "name": "result",
                "type": "object",
                "label": f"Result from {func.get('name', 'function')}",
            })
        return {"fields": fields, "source": "mcp_function"}
    
    # Check for consolidated input_schema (which may hint at output)
    input_schema = config.get("input_schema", {})
    if input_schema.get("properties"):
        for name, prop in input_schema["properties"].items():
            fields.append({
                "name": name,
                "type": prop.get("type", "string"),
                "label": prop.get("description", name),
            })
        return {"fields": fields, "source": "input_schema"}
    
    return {"fields": [], "error": "No schema found for tool"}


def get_tool_input_schema(db: Session, tool_id: int) -> Dict[str, Any]:
    """
    Get the input schema for a tool (what fields it expects).
    
    Args:
        db: Database session
        tool_id: The tool ID
        
    Returns:
        Schema dict with fields array
    """
    from app.models.tools import Tool
    
    tool = db.query(Tool).filter(Tool.id == tool_id).first()
    if not tool:
        return {"fields": [], "error": f"Tool {tool_id} not found"}
    
    config = tool.configuration or {}
    fields = []
    
    # Check for GUI tool FIRST (check both tool_type and presence of gui_schema)
    is_gui_tool = (hasattr(tool, "tool_type") and tool.tool_type == "gui")
    has_gui_schema = "gui_schema" in config
    
    if is_gui_tool or has_gui_schema:
        gui_schema = config.get("gui_schema", {})
        # GUI tools store form components as either "fields" or "components"
        gui_fields = gui_schema.get("fields") or gui_schema.get("components") or []
        for field in gui_fields:
            field_name = field.get("id", field.get("name", ""))
            if field_name:
                fields.append({
                    "name": field_name,
                    "type": field.get("type", "string"),
                    "label": field.get("title", field.get("label", field_name)),
                })
        if fields:
            return {"fields": fields, "source": "gui_schema"}
    
    # For MCP tools: Check selected_functions FIRST (actual function parameters)
    # This takes priority over input_schema to prevent stale generated schemas
    selected_functions = config.get("selected_functions", [])
    if selected_functions:
        for func in selected_functions:
            # Get input parameters from function schema
            input_params = func.get("inputSchema", {}).get("properties", {})
            for name, prop in input_params.items():
                fields.append({
                    "name": name,
                    "type": prop.get("type", "string"),
                    "label": prop.get("description", name),
                })
        if fields:
            return {"fields": fields, "source": "mcp_function_input"}
    
    # Fallback: Check for consolidated input_schema (LLM-generated or manual)
    # Only used if no selected_functions are available
    input_schema = config.get("input_schema", {})
    if input_schema.get("properties"):
        for name, prop in input_schema["properties"].items():
            fields.append({
                "name": name,
                "type": prop.get("type", "string"),
                "label": prop.get("description", name),
            })
        return {"fields": fields, "source": "input_schema"}
    
    return {"fields": [], "error": "No input schema found for tool"}



def get_node_output_schema(
    graph: Dict[str, Any],
    node_id: str,
    db: Optional[Session] = None
) -> Dict[str, Any]:
    """
    Get the output schema for a specific node.
    
    Args:
        graph: The agent graph
        node_id: The node to analyze
        db: Database session (required for CALL_TOOL nodes)
        
    Returns:
        Schema with fields array and optional errors
    """
    node = get_node_by_id(graph, node_id)
    if not node:
        return {"fields": [], "error": f"Node {node_id} not found"}
    
    node_type = node.get("type")
    # Handle enum values
    if hasattr(node_type, "value"):
        node_type = node_type.value
    
    params = node.get("params", {})
    
    # Schema based on node type
    if node_type == "START":
        # START node outputs the agent inputs
        return {
            "fields": [
                {"name": "_started", "type": "boolean", "label": "Started flag"},
                {"name": "_user_id", "type": "integer", "label": "User ID"},
            ],
            "source": "start_node",
            "note": "Also outputs all agent input variables"
        }
    
    elif node_type == "CALL_TOOL":
        tool_id = params.get("tool_id")
        if tool_id and db:
            return get_tool_output_schema(db, tool_id)
        return {"fields": [], "error": "No tool_id or database session"}
    
    elif node_type == "HTTP_REQUEST":
        # HTTP response schema is dynamic, provide common fields
        return {
            "fields": [
                {"name": "status_code", "type": "integer", "label": "HTTP Status Code"},
                {"name": "data", "type": "object", "label": "Response Body"},
                {"name": "headers", "type": "object", "label": "Response Headers"},
            ],
            "source": "http_response",
            "note": "Actual response structure depends on the API"
        }
    
    elif node_type == "JSON_MAPPING":
        output_var = params.get("output_variable", "mapped_data")
        return {
            "fields": [
                {"name": output_var, "type": "any", "label": "Mapped Data"},
                {"name": "result", "type": "any", "label": "Mapping Result"},
            ],
            "source": "json_mapping"
        }
    
    elif node_type == "TEXT_TEMPLATE":
        return {
            "fields": [
                {"name": "formatted_text", "type": "string", "label": "Formatted Text"},
                {"name": "text", "type": "string", "label": "Output Text"},
            ],
            "source": "text_template"
        }
    
    elif node_type == "LLM_DECISION":
        output_var = params.get("output_variable", "llm_output")
        return {
            "fields": [
                {"name": output_var, "type": "string", "label": "LLM Output"},
                {"name": "decision", "type": "string", "label": "Decision"},
                {"name": "reasoning", "type": "string", "label": "Reasoning"},
            ],
            "source": "llm_decision"
        }
    
    elif node_type == "CONDITION":
        return {
            "fields": [
                {"name": "branch", "type": "string", "label": "Branch taken (true/false)"},
            ],
            "source": "condition",
            "note": "Passes through all input variables"
        }
    
    elif node_type == "FOREACH":
        return {
            "fields": [
                {"name": "results", "type": "array", "label": "Collected Results"},
                {"name": "item", "type": "any", "label": "Current Item (during iteration)"},
            ],
            "source": "foreach"
        }
    
    elif node_type == "DOCUMENT_CONVERTER":
        output_var = params.get("output_variable", "converted_document")
        return {
            "fields": [
                {"name": output_var, "type": "string", "label": "Converted Document"},
                {"name": "output_path", "type": "string", "label": "Output File Path"},
                {"name": "detected_input_format", "type": "string", "label": "Detected Input Format"},
            ],
            "source": "document_converter"
        }
    
    elif node_type == "END":
        return {
            "fields": [],
            "source": "end_node",
            "note": "End node has no output"
        }
    
    return {"fields": [], "error": f"Unknown node type: {node_type}"}


def get_node_input_schema(
    graph: Dict[str, Any],
    node_id: str,
    db: Optional[Session] = None
) -> Dict[str, Any]:
    """
    Get the input schema for a specific node (what fields it expects).
    
    Args:
        graph: The agent graph
        node_id: The node to analyze
        db: Database session (required for CALL_TOOL nodes)
        
    Returns:
        Schema with fields array and optional errors
    """
    node = get_node_by_id(graph, node_id)
    if not node:
        return {"fields": [], "error": f"Node {node_id} not found"}
    
    node_type = node.get("type")
    # Handle enum values
    if hasattr(node_type, "value"):
        node_type = node_type.value
    
    params = node.get("params", {})
    
    # Input schema based on node type
    if node_type == "START":
        # START node doesn't accept inputs from other nodes
        return {
            "fields": [],
            "source": "start_node",
            "note": "START node is the entry point"
        }
    
    elif node_type == "CALL_TOOL":
        tool_id = params.get("tool_id")
        if tool_id and db:
            return get_tool_input_schema(db, tool_id)
        return {"fields": [], "error": "No tool_id or database session"}
    
    elif node_type == "HTTP_REQUEST":
        # HTTP request expected inputs
        return {
            "fields": [
                {"name": "url", "type": "string", "label": "Request URL"},
                {"name": "body", "type": "object", "label": "Request Body"},
                {"name": "headers", "type": "object", "label": "Request Headers"},
            ],
            "source": "http_request"
        }
    
    elif node_type == "JSON_MAPPING":
        # JSON mapping accepts any data
        return {
            "fields": [
                {"name": "data", "type": "any", "label": "Input Data"},
            ],
            "source": "json_mapping"
        }
    
    elif node_type == "TEXT_TEMPLATE":
        # Text template expects context variables
        # Could parse the template for variable references
        return {
            "fields": [
                {"name": "context", "type": "object", "label": "Template Context"},
            ],
            "source": "text_template"
        }
    
    elif node_type == "LLM_DECISION":
        return {
            "fields": [
                {"name": "input", "type": "string", "label": "Input Text"},
                {"name": "context", "type": "object", "label": "Context Variables"},
            ],
            "source": "llm_decision"
        }
    
    elif node_type == "CONDITION":
        return {
            "fields": [
                {"name": "value", "type": "any", "label": "Value to evaluate"},
            ],
            "source": "condition"
        }
    
    elif node_type == "FOREACH":
        return {
            "fields": [
                {"name": "items", "type": "array", "label": "Items to iterate"},
            ],
            "source": "foreach"
        }
    
    elif node_type == "DOCUMENT_CONVERTER":
        return {
            "fields": [
                {"name": "input_file", "type": "string", "label": "Input File/Content"},
                {"name": "input_format", "type": "string", "label": "Input Format"},
                {"name": "output_format", "type": "string", "label": "Output Format"},
                {"name": "output_path", "type": "string", "label": "Output Path (optional)"},
            ],
            "source": "document_converter"
        }
    
    elif node_type == "END":
        # End node accepts any final results
        return {
            "fields": [
                {"name": "result", "type": "any", "label": "Final Result"},
            ],
            "source": "end_node"
        }
    
    return {"fields": [], "error": f"Unknown node type: {node_type}"}


def get_incoming_schemas(
    graph: Dict[str, Any],
    target_node_id: str,
    db: Optional[Session] = None
) -> List[Dict[str, Any]]:
    """
    Get output schemas from all nodes connected TO the target node.
    
    Args:
        graph: The agent graph
        target_node_id: The node receiving data
        db: Database session
        
    Returns:
        List of schemas with node info
    """
    incoming_ids = get_incoming_node_ids(graph, target_node_id)
    schemas = []
    
    for source_id in incoming_ids:
        node = get_node_by_id(graph, source_id)
        if node:
            node_type = node.get("type")
            if hasattr(node_type, "value"):
                node_type = node_type.value
            
            schema = get_node_output_schema(graph, source_id, db)
            schemas.append({
                "node_id": source_id,
                "node_type": node_type,
                "label": node.get("metadata", {}).get("label", source_id),
                **schema
            })
    
    return schemas


def get_outgoing_schemas(
    graph: Dict[str, Any],
    source_node_id: str,
    db: Optional[Session] = None
) -> List[Dict[str, Any]]:
    """
    Get input schemas from all nodes that the source node connects TO.
    
    For now, returns the same as output schemas since most primitives
    accept the same structure they output.
    
    Args:
        graph: The agent graph
        source_node_id: The node sending data
        db: Database session
        
    Returns:
        List of schemas with node info
    """
    outgoing_ids = get_outgoing_node_ids(graph, source_node_id)
    schemas = []
    
    for target_id in outgoing_ids:
        node = get_node_by_id(graph, target_id)
        if node:
            node_type = node.get("type")
            if hasattr(node_type, "value"):
                node_type = node_type.value
            
            # For input schemas, we look at what the target node expects
            schema = get_node_input_schema(graph, target_id, db)
            schemas.append({
                "node_id": target_id,
                "node_type": node_type,
                "label": node.get("metadata", {}).get("label", target_id),
                **schema
            })
    
    return schemas
