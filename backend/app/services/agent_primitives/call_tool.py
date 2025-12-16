"""
Call Tool Primitive

Invokes a defined Tool (wrapping MCP server functions) using the tool runtime.
"""
from typing import Any, Dict
from app.services.agent_primitives.base import BasePrimitive, PrimitiveResult


class CallToolPrimitive(BasePrimitive):
    """
    Primitive for invoking tools defined in the system.
    
    Uses the tool_runtime service to execute MCP-wrapped functions.
    Handles both MCP tools and GUI tools.
    """
    
    @property
    def name(self) -> str:
        return "CALL_TOOL"
    
    @property
    def description(self) -> str:
        return "Invokes a defined Tool (Internal or MCP-wrapped function)."
    
    @property
    def param_schema(self) -> Dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "tool_id": {
                    "type": "integer",
                    "description": "ID of the tool to invoke"
                },
                "function_name": {
                    "type": "string",
                    "description": "Name of the function within the tool"
                },
                "arguments": {
                    "type": "object",
                    "description": "Arguments to pass to the tool",
                    "default": {}
                }
            },
            "required": ["tool_id"]
        }
    
    def _get_function_name_from_tool(self, db, tool_id: int) -> str:
        """
        Get function name from tool configuration.
        
        Falls back to first selected_function if function_name not specified.
        
        Args:
            db: Database session
            tool_id: Tool ID to look up
            
        Returns:
            Function name or empty string if not found
        """
        from app.models.tools import Tool
        
        tool = db.query(Tool).filter(Tool.id == tool_id).first()
        if not tool:
            return ""
        
        config = tool.configuration or {}
        selected_functions = config.get("selected_functions", [])
        
        if selected_functions and len(selected_functions) > 0:
            # Use the first selected function's name
            return selected_functions[0].get("name", "")
        
        return ""
    
    def _is_gui_tool(self, db, tool_id: int) -> tuple:
        """
        Check if a tool is a GUI tool.
        
        Args:
            db: Database session
            tool_id: Tool ID to check
            
        Returns:
            Tuple of (is_gui, gui_schema) where gui_schema is the form config
        """
        from app.models.tools import Tool
        
        tool = db.query(Tool).filter(Tool.id == tool_id).first()
        if not tool:
            return False, None
        
        # Check tool_type field
        if hasattr(tool, 'tool_type') and tool.tool_type == 'gui':
            config = tool.configuration or {}
            gui_schema = config.get("gui_schema", {})
            return True, gui_schema
        
        return False, None
    
    async def execute(
        self, 
        params: Dict[str, Any], 
        state: Dict[str, Any]
    ) -> PrimitiveResult:
        """Execute a tool via the tool runtime."""
        try:
            from app.services.tool_runtime import execute_tool
            from app.core.database import SessionLocal
            
            tool_id = params.get("tool_id")
            function_name = params.get("function_name", "")
            arguments = params.get("arguments", {})
            
            # Resolve variables in static arguments
            resolved_args = {}
            for key, value in arguments.items():
                if isinstance(value, str):
                    resolved_args[key] = self.resolve_variables(value, state)
                else:
                    resolved_args[key] = value
            
            # Merge state variables into arguments (for JSON_MAPPING outputs)
            # State variables are used if not already defined in static arguments
            variables = state.get("variables", {})
            for key, value in variables.items():
                # Skip internal/system keys
                if key.startswith("_") or key in ("type", "tool_name", "values"):
                    continue
                # Only add if not already in resolved_args
                if key not in resolved_args:
                    resolved_args[key] = value
            
            print(f"[CALL_TOOL] MCP resolved_args: {resolved_args}")
            
            # Get database session from state if available
            db = state.get("db")
            if not db:
                db = SessionLocal()
                should_close = True
            else:
                should_close = False
            
            try:
                # Fetch tool first to check type and configuration
                from app.models.tools import Tool
                tool = db.query(Tool).filter(Tool.id == tool_id).first()
                if not tool:
                    return PrimitiveResult(
                        success=False,
                        error=f"Tool with ID {tool_id} not found"
                    )

                # Check if this is a GUI tool
                if hasattr(tool, 'tool_type') and tool.tool_type == 'gui':
                    config = tool.configuration or {}
                    gui_schema = config.get("gui_schema", {})
                    
                    # GUI tools require user interaction
                    tool_name = params.get("tool_name", tool.name or "GUI Tool")
                    tool_desc = params.get("tool_description", tool.description or "")
                    
                    # Check if GUI input has been explicitly submitted for THIS tool
                    variables = state.get("variables", {})
                    gui_marker = f"_gui_submitted_for_{tool_id}"
                    
                    print(f"[CALL_TOOL] GUI tool {tool_id} - checking for marker: {gui_marker}")
                    
                    # Only process as "values provided" if the explicit marker exists
                    if variables.get(gui_marker):
                        # GUI input was submitted - get the form values AND CONSUME THEM
                        # We must remove the marker so that if this tool is called again (e.g. in a loop),
                        # it knows to ask for input again instead of reusing the old values.
                        gui_values = variables.pop(gui_marker, {})
                        print(f"[CALL_TOOL] GUI marker found and consumed with values: {gui_values}")
                        
                        return PrimitiveResult(
                            success=True,
                            output={
                                "type": "gui_input_provided",
                                "tool_name": tool_name,
                                "values": gui_values,
                                **gui_values  # Spread values at top level
                            }
                        )
                    
                    # No marker found - request user input
                    return PrimitiveResult(
                        success=True,
                        output={
                            "type": "gui_input_required",
                            "tool_id": tool_id,
                            "tool_name": tool_name,
                            "description": tool_desc,
                            "gui_schema": gui_schema,
                            "message": f"User input required: {tool_desc or tool_name}"
                        }
                    )
                
                # Check for Pipeline configuration
                config = tool.configuration or {}
                pipeline = config.get("pipeline", [])
                
                if pipeline and len(pipeline) > 0:
                    # Execute as Pipeline
                    from app.services.tool_runtime import execute_pipeline
                    print(f"[CALL_TOOL] Executing pipeline for tool {tool_id}")
                    
                    # For pipeline, resolved_args become the input parameters
                    result = await execute_pipeline(
                        db=db,
                        tool_id=tool_id,
                        input_params=resolved_args
                    )
                else:
                    # Execute as Single Function (Legacy/Direct)
                    
                    # For MCP tools, get function name if not specified
                    if not function_name:
                        selected_functions = config.get("selected_functions", [])
                        if selected_functions:
                            function_name = selected_functions[0].get("name", "")
                        
                        if not function_name:
                            return PrimitiveResult(
                                success=False,
                                error=f"No function_name specified and tool {tool_id} has no "
                                      f"selected_functions configured. Please configure the "
                                      f"tool with at least one MCP function."
                            )
                    
                    # Execute the MCP tool function
                    result = await execute_tool(
                        db=db,
                        tool_id=tool_id,
                        params={
                            "name": function_name,
                            "arguments": resolved_args
                        }
                    )
                
                # Check for errors in JSON-RPC response (Common for both pipeline and single exec)
                is_error = result.get("result", {}).get("isError", False)
                
                if is_error:
                    content = result.get("result", {}).get("content", [])
                    error_text = content[0].get("text", "Unknown error") if content else "Unknown error"
                    return PrimitiveResult(
                        success=False,
                        output=result,
                        error=error_text
                    )
                
                return PrimitiveResult(
                    success=True,
                    output=result.get("result", {})
                )
                
            finally:
                if should_close:
                    db.close()
                    
        except Exception as e:
            return PrimitiveResult(
                success=False,
                error=str(e)
            )

