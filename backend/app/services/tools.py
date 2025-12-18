from sqlalchemy.orm import Session
from app.models.tools import Tool, Category, ToolPermission, PermissionLevel, MCPServer, MCPServerPermission, AuthType
from app.schemas.tools import ToolCreate, ToolUpdate, CategoryCreate, CategoryUpdate, ToolPermissionCreate, MCPServerCreate, MCPServerUpdate, MCPServerPermissionCreate
from typing import List, Optional
import json

def get_tool(db: Session, tool_id: int):
    return db.query(Tool).filter(Tool.id == tool_id).first()

def get_tools(db: Session, skip: int = 0, limit: int = 100, category_id: Optional[int] = None):
    query = db.query(Tool)
    if category_id:
        query = query.filter(Tool.category_id == category_id)
    return query.offset(skip).limit(limit).all()

def get_tools_tree_for_user(db: Session, user_id: int, is_admin: bool = False):
    """
    Get tools organized by category with authorization filtering.
    
    Returns tools that a user has access to, grouped by category.
    A user has access to a tool if:
    - Tool is public (is_public = True)
    - User is the tool owner
    - User has direct permission (via tool_permissions.user_id)
    - User's AD group has permission (via tool_permissions.ad_group_id)
    - User is an admin (sees all tools)
    
    Args:
        db: Database session
        user_id: ID of the current user
        is_admin: Whether the user is an admin
        
    Returns:
        List of CategoryTreeNode objects with authorized tools
    """
    from app.models.user import User, UserRole, GroupMapping
    from sqlalchemy import or_
    
    # Get user's AD groups via role mappings
    user_role_ids = db.query(UserRole.role_id).filter(UserRole.user_id == user_id).all()
    user_role_ids = [role_id for (role_id,) in user_role_ids]
    
    # Get AD group IDs from role mappings
    ad_group_ids = db.query(GroupMapping.ad_group_id).filter(
        GroupMapping.role_id.in_(user_role_ids)
    ).all() if user_role_ids else []
    ad_group_ids = [group_id for (group_id,) in ad_group_ids]
    
    # Build the authorization filter
    if is_admin:
        # Admins see all tools
        authorized_tools = db.query(Tool).all()
    else:
        # Build complex authorization filter
        auth_filter = or_(
            Tool.is_public == True,
            Tool.owner_id == user_id
        )
        
        # Add permission-based access
        # Use a subquery to check if user has permission
        if ad_group_ids:
            authorized_tools = db.query(Tool).outerjoin(
                ToolPermission,
                ToolPermission.tool_id == Tool.id
            ).filter(
                or_(
                    auth_filter,
                    ToolPermission.user_id == user_id,
                    ToolPermission.ad_group_id.in_(ad_group_ids)
                )
            ).distinct().all()
        else:
            authorized_tools = db.query(Tool).outerjoin(
                ToolPermission,
                ToolPermission.tool_id == Tool.id
            ).filter(
                or_(
                    auth_filter,
                    ToolPermission.user_id == user_id
                )
            ).distinct().all()
    
    # Get all categories
    categories = db.query(Category).all()
    
    # Organize tools by category
    from app.schemas.tools import CategoryTreeNode, ToolTreeItem
    
    result = []
    
    # Add categorized tools
    for category in categories:
        category_tools = [
            tool for tool in authorized_tools 
            if tool.category_id == category.id
        ]
        
        if category_tools:  # Only include categories with tools
            result.append(CategoryTreeNode(
                id=category.id,
                name=category.name,
                description=category.description,
                tools=[
                    ToolTreeItem(
                        id=tool.id,
                        name=tool.name,
                        description=tool.description,
                        tool_type=tool.tool_type or 'mcp'
                    )
                    for tool in category_tools
                ]
            ))
    
    # Add uncategorized tools
    uncategorized_tools = [
        tool for tool in authorized_tools 
        if tool.category_id is None
    ]
    
    if uncategorized_tools:
        result.append(CategoryTreeNode(
            id=None,
            name="Uncategorized",
            description="Tools without a category",
            tools=[
                ToolTreeItem(
                    id=tool.id,
                    name=tool.name,
                    description=tool.description,
                    tool_type=tool.tool_type or 'mcp'
                )
                for tool in uncategorized_tools
            ]
        ))
    
    return result

def create_tool(db: Session, tool: ToolCreate, owner_id: int):
    db_tool = Tool(
        name=tool.name,
        description=tool.description,
        tool_type=tool.tool_type,  # MCP or GUI
        category_id=tool.category_id,
        configuration=tool.configuration,
        system_prompt=tool.system_prompt,
        is_public=tool.is_public,
        owner_id=owner_id
    )
    db.add(db_tool)
    db.commit()
    db.refresh(db_tool)

    if tool.permissions:
        for perm in tool.permissions:
            db_perm = ToolPermission(
                tool_id=db_tool.id,
                user_id=perm.user_id,
                ad_group_id=perm.ad_group_id,
                permission_level=perm.permission_level
            )
            db.add(db_perm)
        db.commit()
        db.refresh(db_tool)
        
    return db_tool

def update_tool(db: Session, tool_id: int, tool: ToolUpdate):
    db_tool = get_tool(db, tool_id)
    if not db_tool:
        return None
    
    update_data = tool.dict(exclude_unset=True)
    
    # Handle permissions separately
    if "permissions" in update_data:
        permissions_data = update_data.pop("permissions")
        # Clear existing permissions
        db.query(ToolPermission).filter(ToolPermission.tool_id == tool_id).delete()
        # Add new permissions
        for perm in permissions_data:
            # perm is a dict here because it came from .dict()
            db_perm = ToolPermission(
                tool_id=tool_id,
                user_id=perm.get("user_id"),
                ad_group_id=perm.get("ad_group_id"),
                permission_level=perm.get("permission_level")
            )
            db.add(db_perm)

    for key, value in update_data.items():
        setattr(db_tool, key, value)
    
    db.add(db_tool)
    db.commit()
    db.refresh(db_tool)
    return db_tool

def delete_tool(db: Session, tool_id: int):
    db_tool = get_tool(db, tool_id)
    if db_tool:
        db.delete(db_tool)
        db.commit()
    return db_tool

def get_categories(db: Session, skip: int = 0, limit: int = 100):
    return db.query(Category).offset(skip).limit(limit).all()

def create_category(db: Session, category: CategoryCreate):
    db_category = Category(name=category.name, description=category.description)
    db.add(db_category)
    db.commit()
    db.refresh(db_category)
    return db_category


def get_category(db: Session, category_id: int):
    """Get a single category by ID."""
    return db.query(Category).filter(Category.id == category_id).first()


def update_category(db: Session, category_id: int, category: "CategoryUpdate"):
    """Update a category's name and/or description."""
    db_category = get_category(db, category_id)
    if not db_category:
        return None
    
    update_data = category.dict(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_category, key, value)
    
    db.add(db_category)
    db.commit()
    db.refresh(db_category)
    return db_category


def delete_category(db: Session, category_id: int):
    """Delete a category. Tools with this category will have category_id set to null."""
    db_category = get_category(db, category_id)
    if db_category:
        # Set category_id to null for all tools in this category
        db.query(Tool).filter(Tool.category_id == category_id).update(
            {"category_id": None}
        )
        db.delete(db_category)
        db.commit()
    return db_category

async def execute_tool(db: Session, tool_id: int, params: dict):
    """
    Execute a tool function using the ToolRuntime.
    
    This function handles the complete execution lifecycle:
    1. Load the tool configuration
    2. Validate input parameters against the function's schema
    3. Execute the MCP function via JSON-RPC 2.0
    4. Return a standardized response
    
    Args:
        db: Database session
        tool_id: ID of the tool to execute
        params: JSON-RPC params containing 'name' and 'arguments'
    
    Returns:
        Standardized JSON-RPC 2.0 response (success or error)
    """
    from app.services.tool_runtime import execute_tool as runtime_execute
    return await runtime_execute(db, tool_id, params)

async def generate_system_prompt(description: str, functions: List[str], server_info: Optional[str] = None) -> str:
    from app.services.llm_service import llm_service
    from app.models.chat import Message

    prompt = f"""
    You are an expert AI assistant helping to configure a tool for an LLM agent.
    
    Your task is to generate a concise and effective System Prompt for a tool based on its description and available functions.
    The System Prompt should instruct the tool on how to behave, when to call its functions, and how to format its output.
    
    Tool Description:
    {description}
    
    Available Functions:
    {', '.join(functions)}
    
    {f"Server Context: {server_info}" if server_info else ""}
    
    Generate ONLY the System Prompt. Do not include any conversational filler.
    """

    messages = [
        Message(role="system", content="You are a helpful assistant that generates system prompts for tools."),
        Message(role="user", content=prompt)
    ]


    response = await llm_service.chat(messages)
    return response


async def generate_input_schema(system_prompt: str, functions_info: Optional[List[dict]] = None) -> dict:
    """
    Generate an input schema from a system prompt using LLM.
    
    Analyzes the system prompt to determine what input parameters the tool expects
    and returns a JSON schema describing those parameters.
    
    Args:
        system_prompt: The tool's system prompt describing its behavior
        functions_info: Optional list of function schemas from MCP servers
        
    Returns:
        JSON schema describing the expected input parameters
    """
    from app.services.llm_service import llm_service
    from app.models.chat import Message
    import json

    # Build context from functions if provided
    functions_context = ""
    if functions_info:
        functions_context = "\n\nAvailable Functions with their schemas:\n"
        for func in functions_info:
            functions_context += f"- {func.get('name', 'Unknown')}: {func.get('description', 'No description')}\n"
            if func.get('inputSchema'):
                functions_context += f"  Input Schema: {json.dumps(func.get('inputSchema'), indent=2)}\n"

    prompt = f"""Analyze the following system prompt and any available function schemas to determine what input parameters this tool expects.

System Prompt:
{system_prompt}
{functions_context}

Based on the above, generate a JSON schema that describes ALL input parameters this tool would need.
The schema should follow this format:
{{
    "type": "object",
    "properties": {{
        "parameter_name": {{
            "type": "string|number|boolean|object|array",
            "description": "What this parameter is for"
        }}
    }},
    "required": ["list", "of", "required", "params"]
}}

Respond with ONLY the JSON schema, no explanations or markdown.
"""

    messages = [
        Message(role="system", content="You are a helpful assistant that analyzes tool prompts and generates JSON schemas. Always output valid JSON only."),
        Message(role="user", content=prompt)
    ]

    response = await llm_service.chat(messages)
    
    # Try to parse the response as JSON
    try:
        # Strip any markdown code blocks if present
        cleaned = response.strip()
        if cleaned.startswith("```"):
            lines = cleaned.split("\n")
            cleaned = "\n".join(lines[1:-1] if lines[-1] == "```" else lines[1:])
        schema = json.loads(cleaned)
        return schema
    except json.JSONDecodeError:
        # Return a basic empty schema if parsing fails
        return {
            "type": "object",
            "properties": {},
            "required": []
        }


async def generate_pipeline(
    description: str,
    functions: List[dict],
    server_functions: dict,
    input_schema: Optional[dict] = None,
    output_schema: Optional[dict] = None
) -> dict:
    """
    Generate a Declarative JSON Pipeline from user description.
    
    Implements Section 2.3 of ToolBuilder.md specification:
    - Uses LLM to map user intent to MCP functions with proper chaining
    - Generates a pipeline conforming to the spec's JSON schema
    - Uses the provided input_schema if given, otherwise auto-generates it
    - Uses the provided output_schema if given, otherwise auto-generates it
    
    Args:
        description: Natural language description of what the tool should do
        functions: List of available MCP functions with their schemas
        server_functions: Mapping of server_id -> function names
        input_schema: Optional existing input schema to use for pipeline generation
        output_schema: Optional existing output schema to preserve
        
    Returns:
        Dict containing:
        - pipeline: The generated JSON pipeline
        - input_schema: The input schema (provided or auto-generated)
        - output_schema: The output schema (provided or auto-generated)
    """
    from app.services.llm_service import llm_service
    from app.models.chat import Message
    
    # Build function documentation for the LLM
    functions_doc = ""
    for func in functions:
        func_name = func.get('name', 'Unknown')
        func_desc = func.get('description', 'No description')
        func_input_schema = func.get('inputSchema', {})
        server_id = func.get('serverId', 'unknown')
        
        functions_doc += f"""
Function: {server_id}.{func_name}
Description: {func_desc}
Input Schema: {json.dumps(func_input_schema, indent=2)}
"""
    
    # Include existing input schema in prompt if provided
    schema_instruction = ""
    if input_schema:
        schema_instruction = f"""
IMPORTANT - USE THIS EXISTING INPUT SCHEMA:
The following input schema has already been defined. You MUST use these exact input
parameter names in your {{ input.xxx }} references. Do NOT generate a new input_schema.

Existing Input Schema:
{json.dumps(input_schema, indent=2)}

For each input parameter in this schema, use {{ input.parameter_name }} syntax in your pipeline.
"""
    else:
        schema_instruction = """
INPUT SCHEMA:
Analyze what inputs the first step (or any step) requires from the user - these become 
the tool's input parameters. Generate an input_schema that describes these parameters.
"""

    # Pre-compute conditional rules for the prompt (avoid backslash in f-string)
    rule_5 = "5. Use the input parameters from the EXISTING INPUT SCHEMA provided above" if input_schema else "5. Generate an input_schema describing required tool inputs"
    rule_6 = "6. Use the output schema from the EXISTING OUTPUT SCHEMA provided above" if output_schema else "6. Generate an output_schema describing what the tool returns (based on the final step's output)"
    output_2 = '2. Do NOT include input_schema - use the existing one provided' if input_schema else '2. "input_schema" - JSON Schema describing required tool inputs'
    output_3 = '3. Do NOT include output_schema - use the existing one provided' if output_schema else '3. "output_schema" - JSON Schema describing what the tool returns'

    prompt = f"""You are an expert at creating execution pipelines for tools.

Your task is to generate a Declarative JSON Pipeline based on the user's description.
The pipeline will be executed sequentially, calling MCP functions in order.

USER DESCRIPTION:
{description}

AVAILABLE FUNCTIONS:
{functions_doc}
{schema_instruction}

PIPELINE FORMAT:
The pipeline must follow this exact JSON structure:
{{
  "pipeline": [
    {{
      "step_id": "step1",
      "function_ref": "server_id.function_name",
      "arguments": {{
        "param_name": "static_value or {{{{ variable }}}}"
      }}
    }}
  ]
}}

VARIABLE SYNTAX:
- Use {{{{ input.argument_name }}}} for tool input parameters
- Use {{{{ step_id.result.field_name }}}} for output from previous steps (e.g., {{{{ step1.result.user_id }}}})
- Use {{{{ env.VARIABLE_NAME }}}} for environment variables

RULES:
1. Each step must have a unique step_id (e.g., step1, step2, find_user, get_invoices)
2. function_ref must be in format: server_id.function_name
3. Chain data between steps using the variable syntax
4. The final step's result becomes the tool's output
{rule_5}
{rule_6}

OUTPUT FORMAT:
Respond with valid JSON only containing:
1. "pipeline" - the array of pipeline steps
{output_2}
{output_3}

Now generate the pipeline for the user's description. Output ONLY valid JSON."""

    messages = [
        Message(
            role="system",
            content="You are a pipeline generator. Output valid JSON only. No markdown, no explanations."
        ),
        Message(role="user", content=prompt)
    ]
    
    response = await llm_service.chat(messages)
    
    # Parse the LLM response
    try:
        # Strip any markdown code blocks if present
        cleaned = response.strip()
        if cleaned.startswith("```"):
            lines = cleaned.split("\n")
            # Remove first and last lines (```json and ```)
            if lines[-1].strip() == "```":
                cleaned = "\n".join(lines[1:-1])
            else:
                cleaned = "\n".join(lines[1:])
        
        result = json.loads(cleaned)
        
        # Validate pipeline structure
        if "pipeline" not in result:
            result = {"pipeline": [], "input_schema": {"type": "object", "properties": {}, "required": []}}
        
        # If we were given an existing input_schema, use it
        # Otherwise, use LLM's generated schema or extract from pipeline
        if input_schema:
            result["input_schema"] = input_schema
        elif "input_schema" not in result:
            # Auto-generate input schema from pipeline {{ input.x }} references
            result["input_schema"] = _extract_input_schema_from_pipeline(result["pipeline"])
        
        # If we were given an existing output_schema, use it
        # Otherwise, use LLM's generated schema or infer from last step
        if output_schema:
            result["output_schema"] = output_schema
        elif "output_schema" not in result:
            # Auto-generate output schema from last pipeline step
            result["output_schema"] = _extract_output_schema_from_pipeline(result["pipeline"], functions)
        
        return result
        
    except json.JSONDecodeError:
        # Return empty pipeline on parse failure
        return {
            "pipeline": [],
            "input_schema": {
                "type": "object",
                "properties": {},
                "required": []
            },
            "output_schema": {
                "type": "object",
                "properties": {},
                "description": "Output from the tool"
            },
            "error": "Failed to parse LLM response as JSON"
        }


def _extract_input_schema_from_pipeline(pipeline: List[dict]) -> dict:
    """
    Extract input schema from pipeline by finding {{ input.x }} references.
    
    Args:
        pipeline: List of pipeline steps
        
    Returns:
        JSON Schema describing the required inputs
    """
    import re
    
    input_vars = set()
    pattern = r'\{\{\s*input\.(\w+)\s*\}\}'
    
    for step in pipeline:
        arguments = step.get("arguments", {})
        for arg_value in arguments.values():
            if isinstance(arg_value, str):
                matches = re.findall(pattern, arg_value)
                input_vars.update(matches)
    
    # Build schema from discovered variables
    properties = {}
    for var in input_vars:
        properties[var] = {
            "type": "string",
            "description": f"Input parameter: {var}"
        }
    
    return {
        "type": "object",
        "properties": properties,
        "required": list(input_vars)
    }


def _extract_output_schema_from_pipeline(pipeline: List[dict], functions: List[dict]) -> dict:
    """
    Extract output schema from pipeline by looking at the last step's function.
    
    Args:
        pipeline: List of pipeline steps
        functions: List of available functions with schemas
        
    Returns:
        JSON Schema describing the expected output
    """
    if not pipeline:
        return {
            "type": "object",
            "properties": {},
            "description": "Output from the tool"
        }
    
    # Get the last step's function reference
    last_step = pipeline[-1]
    function_ref = last_step.get("function_ref", "")
    
    # Try to find the matching function's output schema
    # function_ref format is "server_id.function_name"
    parts = function_ref.split(".", 1)
    if len(parts) == 2:
        _, func_name = parts
        for func in functions:
            if func.get("name") == func_name:
                # Some functions may have output schema defined
                if "outputSchema" in func:
                    return func["outputSchema"]
                # Otherwise infer from function name
                return {
                    "type": "object",
                    "properties": {
                        "result": {
                            "type": "object",
                            "description": f"Result from {func_name}"
                        }
                    },
                    "description": f"Output from {func_name}"
                }
    
    # Fallback - generic output schema
    return {
        "type": "object",
        "properties": {
            "result": {
                "type": "object",
                "description": "Result from the pipeline"
            }
        },
        "description": "Output from the tool pipeline"
    }


# MCP Server CRUD operations
def get_mcp_servers(db: Session, skip: int = 0, limit: int = 100):
    return db.query(MCPServer).offset(skip).limit(limit).all()

def get_mcp_server(db: Session, server_id: int):
    return db.query(MCPServer).filter(MCPServer.id == server_id).first()

def create_mcp_server(db: Session, server: MCPServerCreate):
    db_server = MCPServer(
        name=server.name,
        base_url=server.base_url,
        description=server.description,
        auth_type=server.auth_type,
        auth_config=server.auth_config,
        is_active=server.is_active
    )
    db.add(db_server)
    db.commit()
    db.refresh(db_server)

    if server.permissions:
        for perm in server.permissions:
            db_perm = MCPServerPermission(
                mcp_server_id=db_server.id,
                user_id=perm.user_id,
                ad_group_id=perm.ad_group_id
            )
            db.add(db_perm)
        db.commit()
        db.refresh(db_server)
        
    return db_server

def update_mcp_server(db: Session, server_id: int, server: MCPServerUpdate):
    db_server = get_mcp_server(db, server_id)
    if not db_server:
        return None
    
    update_data = server.dict(exclude_unset=True)
    
    # Handle permissions separately
    if "permissions" in update_data:
        permissions_data = update_data.pop("permissions")
        # Clear existing permissions
        db.query(MCPServerPermission).filter(MCPServerPermission.mcp_server_id == server_id).delete()
        # Add new permissions
        for perm in permissions_data:
            db_perm = MCPServerPermission(
                mcp_server_id=server_id,
                user_id=perm.get("user_id"),
                ad_group_id=perm.get("ad_group_id")
            )
            db.add(db_perm)

    for key, value in update_data.items():
        setattr(db_server, key, value)
    
    db.add(db_server)
    db.commit()
    db.refresh(db_server)
    return db_server

def delete_mcp_server(db: Session, server_id: int):
    db_server = get_mcp_server(db, server_id)
    if db_server:
        db.delete(db_server)
        db.commit()
    return db_server

async def discover_functions(db: Session, server_id: int) -> dict:
    """
    Discover tools from an MCP server using JSON-RPC 2.0 protocol.
    
    According to MCP spec, we send a JSON-RPC request with method "tools/list"
    and expect a response with the list of available tools.
    """
    import httpx
    import uuid
    
    # Get the MCP server configuration
    server = db.query(MCPServer).filter(MCPServer.id == server_id).first()
    if not server:
        raise ValueError(f"MCP Server with id {server_id} not found")
    
    # Prepare JSON-RPC 2.0 request for tool discovery
    jsonrpc_request = {
        "jsonrpc": "2.0",
        "method": "tools/list",
        "params": {},
        "id": str(uuid.uuid4())
    }
    
    # Prepare headers
    headers = {
        "Content-Type": "application/json"
    }
    
    # Add authentication if configured
    if server.auth_type == AuthType.API_KEY and server.auth_config:
        api_key = server.auth_config.get("api_key")
        if api_key:
            headers["Authorization"] = f"Bearer {api_key}"
    
    elif server.auth_type == AuthType.OAUTH2 and server.auth_config:
        # For OAuth2, we would need to get a token first
        # This is simplified - in production, implement proper OAuth2 flow
        client_id = server.auth_config.get("client_id")
        client_secret = server.auth_config.get("client_secret")
        token_url = server.auth_config.get("token_url")
        
        if all([client_id, client_secret, token_url]):
            # Get OAuth2 token
            async with httpx.AsyncClient() as client:
                token_response = await client.post(
                    token_url,
                    data={
                        "grant_type": "client_credentials",
                        "client_id": client_id,
                        "client_secret": client_secret
                    }
                )
                if token_response.status_code == 200:
                    token_data = token_response.json()
                    access_token = token_data.get("access_token")
                    if access_token:
                        headers["Authorization"] = f"Bearer {access_token}"
    
    # Make the JSON-RPC request to the MCP server
    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            response = await client.post(
                server.base_url,
                json=jsonrpc_request,
                headers=headers
            )
            
            response.raise_for_status()
            data = response.json()
            
            # Validate JSON-RPC response
            if "error" in data:
                error = data["error"]
                raise ValueError(f"MCP Server Error: {error.get('message', 'Unknown error')}")
            
            if "result" not in data:
                raise ValueError("Invalid JSON-RPC response: missing 'result' field")
            
            result = data["result"]
            
            # Extract tools from the result
            # MCP spec: result should contain "tools" array
            tools = result.get("tools", [])
            
            # Return structured data
            return {
                "success": True,
                "tools": tools,
                "count": len(tools)
            }
            
        except httpx.HTTPError as e:
            return {
                "success": False,
                "error": f"HTTP Error: {str(e)}",
                "tools": []
            }
        except Exception as e:
            return {
                "success": False,
                "error": f"Error: {str(e)}",
                "tools": []
            }

def get_mcp_servers_for_user(db: Session, user_id: int, skip: int = 0, limit: int = 100):
    """
    Get MCP servers that a user has access to (either directly or via AD group).
    """
    from app.models.user import User, UserRole
    
    # Get user and their roles/groups
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        return []
    
    # Get user's AD groups via role mappings
    user_role_ids = db.query(UserRole.role_id).filter(UserRole.user_id == user_id).all()
    user_role_ids = [role_id for (role_id,) in user_role_ids]
    
    # Get AD group IDs from role mappings
    from app.models.user import GroupMapping
    ad_group_ids = db.query(GroupMapping.ad_group_id).filter(
        GroupMapping.role_id.in_(user_role_ids)
    ).all()
    ad_group_ids = [group_id for (group_id,) in ad_group_ids]
    
    # Find servers where user has direct access or group access
    servers = db.query(MCPServer).join(
        MCPServerPermission,
        MCPServerPermission.mcp_server_id == MCPServer.id,
        isouter=False
    ).filter(
        (MCPServerPermission.user_id == user_id) |
        (MCPServerPermission.ad_group_id.in_(ad_group_ids))
    ).distinct().offset(skip).limit(limit).all()
    
    return servers
