from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from app.core.database import get_db
from app.schemas.tools import (
    Tool, ToolCreate, ToolUpdate, Category, CategoryCreate, CategoryUpdate,
    SystemPromptGenerationRequest, InputSchemaGenerationRequest,
    PipelineGenerationRequest,
    MCPServer, MCPServerCreate, MCPServerUpdate,
    ToolsTreeResponse,
    ToolSuggestionRequest, MappingSuggestionRequest
)
from app.services import tools as tool_service
from app.routers.auth import get_current_active_user, get_current_admin_user
from app.models.user import User

router = APIRouter()

@router.get("/tools", response_model=List[Tool])
def read_tools(
    skip: int = 0,
    limit: int = 100,
    category_id: int = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    tools = tool_service.get_tools(db, skip=skip, limit=limit, category_id=category_id)
    return tools

@router.get("/tools/tree", response_model=ToolsTreeResponse)
def read_tools_tree(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Get tools organized by category with authorization filtering.
    Returns only tools the current user has access to.
    """
    is_admin = any(role.name == "Admin" for role in current_user.roles)
    
    categories = tool_service.get_tools_tree_for_user(
        db=db,
        user_id=current_user.id,
        is_admin=is_admin
    )
    
    return ToolsTreeResponse(categories=categories)

@router.post("/tools", response_model=Tool)
def create_tool(
    tool: ToolCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    return tool_service.create_tool(db=db, tool=tool, owner_id=current_user.id)

@router.get("/tools/{tool_id}", response_model=Tool)
def read_tool(
    tool_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    db_tool = tool_service.get_tool(db, tool_id=tool_id)
    if db_tool is None:
        raise HTTPException(status_code=404, detail="Tool not found")
    return db_tool

@router.put("/tools/{tool_id}", response_model=Tool)
def update_tool(
    tool_id: int,
    tool: ToolUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    # Add permission check here (only owner or admin)
    db_tool = tool_service.get_tool(db, tool_id=tool_id)
    if not db_tool:
        raise HTTPException(status_code=404, detail="Tool not found")
    if db_tool.owner_id != current_user.id: # Simple check for now
         raise HTTPException(status_code=403, detail="Not authorized to update this tool")
         
    return tool_service.update_tool(db=db, tool_id=tool_id, tool=tool)

@router.delete("/tools/{tool_id}", response_model=Tool)
def delete_tool(
    tool_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    # Add permission check here
    db_tool = tool_service.get_tool(db, tool_id=tool_id)
    if not db_tool:
        raise HTTPException(status_code=404, detail="Tool not found")
    if db_tool.owner_id != current_user.id:
         raise HTTPException(status_code=403, detail="Not authorized to delete this tool")

    return tool_service.delete_tool(db=db, tool_id=tool_id)

@router.get("/categories", response_model=List[Category])
def read_categories(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    return tool_service.get_categories(db, skip=skip, limit=limit)

@router.post("/categories", response_model=Category)
def create_category(
    category: CategoryCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user)
):
    """Create a new category. Admin only."""
    return tool_service.create_category(db=db, category=category)


@router.get("/categories/{category_id}", response_model=Category)
def read_category(
    category_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Get a single category by ID."""
    db_category = tool_service.get_category(db, category_id=category_id)
    if db_category is None:
        raise HTTPException(status_code=404, detail="Category not found")
    return db_category


@router.put("/categories/{category_id}", response_model=Category)
def update_category(
    category_id: int,
    category: CategoryUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user)
):
    """Update a category. Admin only."""
    db_category = tool_service.update_category(
        db=db, category_id=category_id, category=category
    )
    if not db_category:
        raise HTTPException(status_code=404, detail="Category not found")
    return db_category


@router.delete("/categories/{category_id}", response_model=Category)
def delete_category(
    category_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user)
):
    """Delete a category. Admin only. Tools in this category will be uncategorized."""
    db_category = tool_service.delete_category(db=db, category_id=category_id)
    if not db_category:
        raise HTTPException(status_code=404, detail="Category not found")
    return db_category

@router.post("/tools/{tool_id}/execute")
async def execute_tool(
    tool_id: int,
    params: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    return await tool_service.execute_tool(db=db, tool_id=tool_id, params=params)


@router.post("/tools/{tool_id}/execute-pipeline")
async def execute_pipeline(
    tool_id: int,
    params: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Execute a tool's pipeline with input parameters.
    
    This endpoint is for tools that have a declarative JSON pipeline configured.
    
    Request body:
    {
        "input": { ... input parameters ... },
        "id": 1  // optional request ID
    }
    """
    from app.services.tool_runtime import execute_pipeline as rt_execute_pipeline
    
    input_params = params.get("input", {})
    request_id = params.get("id", 1)
    
    include_trace = params.get("include_trace", False)
    
    return await rt_execute_pipeline(
        db=db,
        tool_id=tool_id,
        input_params=input_params,
        request_id=request_id,
        include_trace=include_trace
    )

@router.post("/generate-prompt")
async def generate_system_prompt(
    request: SystemPromptGenerationRequest,
    current_user: User = Depends(get_current_active_user)
):
    prompt = await tool_service.generate_system_prompt(
        description=request.description,
        functions=request.functions,
        server_info=request.server_info
    )
    return {"system_prompt": prompt}


@router.post("/generate-input-schema")
async def generate_input_schema(
    request: InputSchemaGenerationRequest,
    current_user: User = Depends(get_current_active_user)
):
    """
    Generate an input schema from a system prompt.
    
    Uses LLM to analyze the system prompt and determine expected input parameters.
    """
    schema = await tool_service.generate_input_schema(
        system_prompt=request.system_prompt,
        functions_info=request.functions_info
    )
    return {"input_schema": schema}


@router.post("/generate-pipeline")
async def generate_pipeline(
    request: PipelineGenerationRequest,
    current_user: User = Depends(get_current_active_user)
):
    """
    Generate a Declarative JSON Pipeline from user description.
    
    Implements Section 2.3 of ToolBuilder.md specification.
    Uses LLM to map user intent to MCP functions with proper chaining.
    If input_schema/output_schema are provided, uses them; only generates new if none exists.
    
    Returns:
        - pipeline: The generated JSON pipeline steps
        - input_schema: The input schema (provided or auto-generated)
        - output_schema: The output schema (provided or auto-generated)
    """
    result = await tool_service.generate_pipeline(
        description=request.description,
        functions=request.functions,
        server_functions=request.server_functions,
        input_schema=request.input_schema,  # Pass existing input schema if provided
        output_schema=request.output_schema,  # Pass existing output schema if provided
        execution_sample=request.execution_sample  # Pass execution sample if provided
    )
    return result


@router.post("/tools/suggest-tools")
async def suggest_tools(
    request: ToolSuggestionRequest,
    current_user: User = Depends(get_current_active_user)
):
    """
    Suggest relevant tools from a list of candidates.
    """
    suggestions = await tool_service.suggest_relevant_tools(
        description=request.description,
        candidates=request.candidates,
        model_name=request.model_name
    )
    return {"suggestions": suggestions}


@router.post("/tools/suggest-mapping")
async def suggest_mapping(
    request: MappingSuggestionRequest,
    current_user: User = Depends(get_current_active_user)
):
    """
    Suggest mappings for a specific step.
    """
    raw_mapping = await tool_service.suggest_mappings(
        description=request.description,
        target_step_id=request.target_step_id,
        target_input_schema=request.target_input_schema,
        available_context=request.available_context,
        model_name=request.model_name
    )
    
    # Flatten the rich response to simple key-value for frontend compatibility
    # The suggest_mappings service now returns { param: { value, type, reason } }
    mapping = {}
    if isinstance(raw_mapping, dict):
        for k, v in raw_mapping.items():
            if isinstance(v, dict) and "value" in v:
                mapping[k] = str(v["value"])
            else:
                mapping[k] = str(v)
            
    return {"mapping": mapping}


# MCP Server endpoints
@router.get("/mcp-servers", response_model=List[MCPServer])
def read_mcp_servers(
    skip: int = 0,
    limit: int = 100,
    for_tool_builder: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Get MCP servers. If for_tool_builder=True, filter by user access.
    Admins always see all servers.
    """
    is_admin = any(role.name == "Admin" for role in current_user.roles)
    
    if for_tool_builder and not is_admin:
        return tool_service.get_mcp_servers_for_user(db, user_id=current_user.id, skip=skip, limit=limit)
    else:
        return tool_service.get_mcp_servers(db, skip=skip, limit=limit)

@router.post("/mcp-servers", response_model=MCPServer)
def create_mcp_server(
    server: MCPServerCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user)
):
    return tool_service.create_mcp_server(db=db, server=server)

@router.get("/mcp-servers/{server_id}", response_model=MCPServer)
def read_mcp_server(
    server_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    db_server = tool_service.get_mcp_server(db, server_id=server_id)
    if db_server is None:
        raise HTTPException(status_code=404, detail="MCP Server not found")
    return db_server

@router.put("/mcp-servers/{server_id}", response_model=MCPServer)
def update_mcp_server(
    server_id: int,
    server: MCPServerUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user)
):
    db_server = tool_service.update_mcp_server(db=db, server_id=server_id, server=server)
    if not db_server:
        raise HTTPException(status_code=404, detail="MCP Server not found")
    return db_server

@router.delete("/mcp-servers/{server_id}", response_model=MCPServer)
def delete_mcp_server(
    server_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user)
):
    db_server = tool_service.delete_mcp_server(db=db, server_id=server_id)
    if not db_server:
        raise HTTPException(status_code=404, detail="MCP Server not found")
    return db_server

@router.post("/mcp-servers/{server_id}/discover")
async def discover_mcp_functions(
    server_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Discover tools from an MCP server using JSON-RPC 2.0 protocol.
    Returns the list of available tools and their schemas.
    """
    db_server = tool_service.get_mcp_server(db, server_id=server_id)
    if not db_server:
        raise HTTPException(status_code=404, detail="MCP Server not found")
    
    result = await tool_service.discover_functions(db=db, server_id=server_id)
    
    # If discovery failed, return error with 400 status
    if not result.get("success"):
        raise HTTPException(
            status_code=400, 
            detail=result.get("error", "Failed to discover tools from MCP server")
        )
    
    return {
        "server_id": server_id,
        "server_name": db_server.name,
        "success": True,
        "tools": result.get("tools", []),
        "count": result.get("count", 0)
    }


# =============================================================================
# Dry-Run Verification Endpoints
# =============================================================================

@router.post("/tools/{tool_id}/dry-run/start")
async def start_dry_run(
    tool_id: int,
    request: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Start an interactive dry-run verification session.
    
    Request body:
    {
        "pipeline": [...pipeline steps...]
    }
    
    Returns session_id and first step requirements.
    """
    from app.services.dry_run import DryRunService
    
    pipeline = request.get("pipeline", [])
    model_name = request.get("model_name") # Extract selected model
    output_schema = request.get("output_schema") # Extract output schema
    if not pipeline:
        raise HTTPException(status_code=400, detail="Pipeline is required")
    
    service = DryRunService(db)
    result = await service.start_session(tool_id, pipeline, model_name=model_name, output_schema=output_schema)
    return result


@router.post("/tools/{tool_id}/dry-run/{session_id}/input")
async def provide_dry_run_input(
    tool_id: int,
    session_id: str,
    request: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Provide input data for the current step.
    
    Request body:
    {
        "input_data": { ... test values ... }
    }
    
    Returns safety check or ready-to-execute status.
    """
    from app.services.dry_run import DryRunService
    
    input_data = request.get("input_data", {})
    input_types = request.get("input_types", {})  # Type definitions for inputs
    
    service = DryRunService(db)
    result = await service.provide_input(session_id, input_data, input_types)
    
    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])
    
    return result


@router.post("/tools/{tool_id}/dry-run/{session_id}/execute")
async def execute_dry_run_step(
    tool_id: int,
    session_id: str,
    request: dict = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Execute the current step and capture schema.
    
    Request body (optional):
    {
        "confirmed": true  // For destructive operations
    }
    
    Returns step result with captured schema and mapping suggestions.
    """
    from app.services.dry_run import DryRunService
    
    confirmed = (request or {}).get("confirmed", False)
    
    service = DryRunService(db)
    result = await service.execute_step(session_id, confirmed)
    
    if "error" in result and not result.get("success", True):
        raise HTTPException(status_code=400, detail=result["error"])
    
    return result


@router.post("/tools/{tool_id}/dry-run/{session_id}/accept")
async def accept_step_mapping(
    tool_id: int,
    session_id: str,
    request: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Accept (or modify) the mapping and move to next step.
    
    Request body:
    {
        "mapping": {
            "target_param": "source_path",
            ...
        },
        "type_transformations": {
            "target_param": "number",  # or "string", "integer", "boolean", "json", "date"
            ...
        }
    }
    
    Returns next step info or completion status.
    """
    from app.services.dry_run import DryRunService
    
    mapping = request.get("mapping", {})
    type_transformations = request.get("type_transformations", {})
    output_mapping = request.get("output_mapping", {})
    
    service = DryRunService(db)
    result = await service.accept_mapping(session_id, mapping, type_transformations, output_mapping)
    
    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])
    
    return result


@router.get("/tools/{tool_id}/dry-run/{session_id}/status")
async def get_dry_run_status(
    tool_id: int,
    session_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Get the current status of a dry-run session.
    """
    from app.services.dry_run import session_manager
    
    session = session_manager.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found or expired")
    
    return {
        "session_id": session.session_id,
        "status": session.status.value,
        "current_step": session.current_step_index,
        "total_steps": len(session.pipeline),
        "is_complete": session.is_complete,
        "error": session.error
    }
