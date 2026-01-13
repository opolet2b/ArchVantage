from pydantic import BaseModel, field_validator
from typing import Optional, List, Dict, Any, Literal
from datetime import datetime
from app.models.tools import PermissionLevel, AuthType

class CategoryBase(BaseModel):
    name: str
    description: Optional[str] = None

class CategoryCreate(CategoryBase):
    pass


class CategoryUpdate(BaseModel):
    """Schema for updating a category."""
    name: Optional[str] = None
    description: Optional[str] = None


class Category(CategoryBase):
    id: int

    class Config:
        from_attributes = True

class ToolPermissionBase(BaseModel):
    user_id: Optional[int] = None
    ad_group_id: Optional[int] = None
    permission_level: PermissionLevel = PermissionLevel.READ

class ToolPermissionCreate(ToolPermissionBase):
    pass

class ToolPermission(ToolPermissionBase):
    id: int
    tool_id: int

    class Config:
        from_attributes = True

# =============================================================================
# GUI Tool Schema Models
# =============================================================================

class GUIWidgetValidation(BaseModel):
    """Validation rules for GUI form widgets."""
    min_length: Optional[int] = None
    max_length: Optional[int] = None
    min_value: Optional[float] = None
    max_value: Optional[float] = None
    pattern: Optional[str] = None  # Regex pattern


class GUIWidgetOption(BaseModel):
    """Option for dropdown/radio/checkbox widgets."""
    label: str
    value: str


class GUIWidget(BaseModel):
    """A single widget in a GUI form."""
    id: str  # Field ID for JSON output (e.g., 'customer_name')
    type: str  # text_input, text_area, number, email, dropdown, etc.
    label: str
    placeholder: Optional[str] = None
    required: bool = False
    validation: Optional[GUIWidgetValidation] = None
    options: Optional[List[GUIWidgetOption]] = None  # For selectors
    default: Optional[str] = None


class GUIToolSchema(BaseModel):
    """Schema for GUI form tools."""
    tool_type: str = "gui"  # Always 'gui'
    version: str = "1.0"
    title: str
    submit_label: str = "Submit"
    components: List[GUIWidget]


# =============================================================================
# Tool Schemas
# =============================================================================

class ToolBase(BaseModel):
    name: str
    description: Optional[str] = None
    tool_type: Optional[Literal['mcp', 'gui']] = 'mcp'  # MCP or GUI, defaults to MCP
    category_id: Optional[int] = None
    configuration: Optional[Dict[str, Any]] = {}
    system_prompt: Optional[str] = None
    is_public: bool = False


class ToolCreate(ToolBase):
    permissions: Optional[List[ToolPermissionCreate]] = []

class ToolUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    tool_type: Optional[Literal['mcp', 'gui']] = None
    category_id: Optional[int] = None
    configuration: Optional[Dict[str, Any]] = None
    system_prompt: Optional[str] = None
    is_public: Optional[bool] = None
    permissions: Optional[List[ToolPermissionCreate]] = None

class Tool(ToolBase):
    id: int
    owner_id: int
    tool_type: Optional[Literal['mcp', 'gui']] = 'mcp'  # Defaults to MCP for existing records
    created_at: datetime
    updated_at: Optional[datetime] = None
    permissions: List[ToolPermission] = []
    category: Optional[Category] = None

    # Normalize tool_type to lowercase (handles uppercase from old Enum storage)
    @field_validator('tool_type', mode='before')
    @classmethod
    def normalize_tool_type(cls, v):
        if v is None:
            return 'mcp'
        if isinstance(v, str):
            return v.lower()
        return v

    class Config:
        from_attributes = True

# =============================================================================
# Tool Tree View Schemas
# =============================================================================

class ToolTreeItem(BaseModel):
    """Simplified tool info for tree view display."""
    id: int
    name: str
    description: Optional[str] = None
    tool_type: str = 'mcp'

class CategoryTreeNode(BaseModel):
    """Category node with its tools for tree view."""
    id: Optional[int] = None  # None for "Uncategorized" category
    name: str
    description: Optional[str] = None
    tools: List[ToolTreeItem] = []

class ToolsTreeResponse(BaseModel):
    """Hierarchical tree structure of categories and tools."""
    categories: List[CategoryTreeNode]

class SystemPromptGenerationRequest(BaseModel):
    description: str
    functions: List[str]
    server_info: Optional[str] = None


class InputSchemaGenerationRequest(BaseModel):
    """Request to generate input schema from system prompt."""
    system_prompt: str
    functions_info: Optional[List[Dict[str, Any]]] = None


class ToolExecuteRequest(BaseModel):
    """
    JSON-RPC 2.0 request format for tool execution.
    
    Example:
    {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "tools/call",
        "params": {
            "name": "calculate_tax",
            "arguments": {"amount": 100, "region": "EU"}
        }
    }
    """
    jsonrpc: str = "2.0"
    id: int
    method: str = "tools/call"
    params: Dict[str, Any]


# =============================================================================
# Pipeline Schema Models (Section 2.3 & 3 of ToolBuilder.md)
# =============================================================================

class PipelineStep(BaseModel):
    """
    A single step in the execution pipeline.
    
    Each step calls one MCP function and can reference:
    - {{ input.argument_name }} - Input passed to the tool at runtime
    - {{ step_id.result.field_name }} - Output from previous steps
    - {{ env.VARIABLE_NAME }} - Environment variables
    """
    step_id: str  # Unique identifier for this step
    function_ref: str  # Format: "server_id.function_name"
    arguments: Dict[str, Any]  # Can contain {{ placeholder }} syntax


class Pipeline(BaseModel):
    """
    Declarative JSON Pipeline structure.
    
    Contains an ordered list of steps to execute sequentially.
    The final step's result becomes the tool's output.
    """
    pipeline: List[PipelineStep]


class PipelineGenerationRequest(BaseModel):
    """Request to generate a pipeline from user description."""
    description: str  # Natural language description of what the tool should do
    functions: List[Dict[str, Any]]  # Available MCP functions with schemas
    server_functions: Dict[str, List[str]]  # server_id -> function names mapping
    input_schema: Optional[Dict[str, Any]] = None  # Existing input schema (if any)
    output_schema: Optional[Dict[str, Any]] = None  # Existing output schema (if any)
    execution_sample: Optional[Any] = None  # Optional sample of execution result for schema generation


class PipelineGenerationResponse(BaseModel):
    """Response from pipeline generation."""
    pipeline: Dict[str, Any]  # The generated pipeline JSON
    input_schema: Dict[str, Any]  # Auto-generated or provided input schema
    output_schema: Dict[str, Any]  # Auto-generated or provided output schema


class PipelineExecutionRequest(BaseModel):
    """Request to execute a tool's pipeline with input parameters."""
    input: Dict[str, Any]  # Runtime input parameters


class MCPServerPermissionBase(BaseModel):
    user_id: Optional[int] = None
    ad_group_id: Optional[int] = None

class MCPServerPermissionCreate(MCPServerPermissionBase):
    pass

class MCPServerPermission(MCPServerPermissionBase):
    id: int
    mcp_server_id: int

    class Config:
        from_attributes = True

class MCPServerBase(BaseModel):
    name: str
    base_url: str
    description: Optional[str] = None
    auth_type: AuthType = AuthType.NONE
    auth_config: Optional[Dict[str, Any]] = {}
    is_active: bool = True

class MCPServerCreate(MCPServerBase):
    permissions: Optional[List[MCPServerPermissionCreate]] = []

class MCPServerUpdate(BaseModel):
    name: Optional[str] = None
    base_url: Optional[str] = None
    description: Optional[str] = None
    auth_type: Optional[AuthType] = None
    auth_config: Optional[Dict[str, Any]] = None
    is_active: Optional[bool] = None
    permissions: Optional[List[MCPServerPermissionCreate]] = None

class MCPServer(MCPServerBase):
    id: int
    created_at: datetime
    updated_at: Optional[datetime] = None
    permissions: List[MCPServerPermission] = []

    class Config:
        from_attributes = True
