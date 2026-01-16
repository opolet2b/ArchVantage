"""
Tool Runtime Wrapper

This module provides the runtime execution environment for tools.
It handles:
- Dynamic Pydantic model generation from JSON Schema
- Input parameter validation
- MCP function execution via JSON-RPC 2.0
- Standardized response formatting
- Exception handling and error capture
"""
from sqlalchemy.orm import Session
from typing import Dict, Any, List, Optional, Type
from pydantic import BaseModel, create_model, ValidationError
import httpx
import uuid
import json
import json
import sys
import io
import traceback
from contextlib import redirect_stdout, redirect_stderr

from app.models.tools import Tool, MCPServer, AuthType


class ToolExecutionResult(BaseModel):
    """Standardized result format for tool execution."""
    jsonrpc: str = "2.0"
    id: int
    result: Dict[str, Any]


def json_schema_type_to_python(json_type: str, format_hint: Optional[str] = None) -> Type:
    """
    Convert JSON Schema types to Python types for Pydantic model creation.
    
    Args:
        json_type: The JSON Schema type string
        format_hint: Optional format hint (e.g., 'date-time')
    
    Returns:
        The corresponding Python type
    """
    type_mapping = {
        "string": str,
        "integer": int,
        "number": float,
        "boolean": bool,
        "array": list,
        "object": dict,
        "null": type(None),
    }
    return type_mapping.get(json_type, Any)


def create_pydantic_model_from_schema(
    schema: Dict[str, Any],
    model_name: str = "DynamicModel"
) -> Type[BaseModel]:
    """
    Create a Pydantic model dynamically from a JSON Schema.
    
    This allows runtime validation of tool parameters against
    the MCP function's input schema.
    
    Args:
        schema: JSON Schema dictionary (from MCP function's inputSchema)
        model_name: Name for the generated model
    
    Returns:
        A Pydantic model class
    """
    if not schema or schema.get("type") != "object":
        # If no schema or not an object type, accept any dict
        return create_model(model_name, __root__=(Dict[str, Any], ...))
    
    properties = schema.get("properties", {})
    required = set(schema.get("required", []))
    
    field_definitions = {}
    
    for field_name, field_schema in properties.items():
        field_type = json_schema_type_to_python(
            field_schema.get("type", "string"),
            field_schema.get("format")
        )
        
        # Handle nested objects (simplified - just use dict)
        if field_schema.get("type") == "object":
            field_type = Dict[str, Any]
        
        # Handle arrays with items
        if field_schema.get("type") == "array":
            items = field_schema.get("items", {})
            item_type = json_schema_type_to_python(items.get("type", "string"))
            field_type = List[item_type]
        
        # Set default based on whether field is required
        if field_name in required:
            field_definitions[field_name] = (field_type, ...)
        else:
            default_value = field_schema.get("default", None)
            field_definitions[field_name] = (Optional[field_type], default_value)
    
    return create_model(model_name, **field_definitions)


def format_success_response(request_id: int, result: Any) -> Dict[str, Any]:
    """
    Format a successful tool execution result in JSON-RPC 2.0 format.
    
    Args:
        request_id: The request ID from the incoming request
        result: The result from the MCP function
    
    Returns:
        Standardized JSON-RPC 2.0 success response
    """
    # Convert result to text if it's not already a string
    if isinstance(result, (dict, list)):
        import json
        text_result = json.dumps(result, indent=2)
    else:
        text_result = str(result)
    
    return {
        "jsonrpc": "2.0",
        "id": request_id,
        "result": {
            "content": [
                {
                    "type": "text",
                    "text": text_result
                }
            ],
            "isError": False
        }
    }


def format_error_response(request_id: int, error: str) -> Dict[str, Any]:
    """
    Format an error result in JSON-RPC 2.0 format.
    
    Args:
        request_id: The request ID from the incoming request
        error: The error message
    
    Returns:
        Standardized JSON-RPC 2.0 error response
    """
    return {
        "jsonrpc": "2.0",
        "id": request_id,
        "result": {
            "content": [
                {
                    "type": "text",
                    "text": error
                }
            ],
            "isError": True
        }
    }


async def execute_mcp_function(
    server: MCPServer,
    function_name: str,
    arguments: Dict[str, Any]
) -> Dict[str, Any]:
    """
    Execute a function on an MCP server via JSON-RPC 2.0.
    
    Sends a tools/call request to the MCP server and returns the response.
    
    Args:
        server: The MCPServer database object
        function_name: Name of the function to call
        arguments: Arguments to pass to the function
    
    Returns:
        The JSON-RPC response from the MCP server
    
    Raises:
        Exception: If the MCP server returns an error or is unreachable
    """
    # Prepare JSON-RPC 2.0 request
    jsonrpc_request = {
        "jsonrpc": "2.0",
        "method": "tools/call",
        "params": {
            "name": function_name,
            "arguments": arguments
        },
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
        client_id = server.auth_config.get("client_id")
        client_secret = server.auth_config.get("client_secret")
        token_url = server.auth_config.get("token_url")
        
        if all([client_id, client_secret, token_url]):
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
    
    print(f"\n[MCP EXECUTION] Server: {server.name} ({server.base_url})")
    print(f"[MCP EXECUTION] Function: {function_name}")
    print(f"[MCP EXECUTION] Arguments: {json.dumps(arguments, indent=2)}")

    # Make the JSON-RPC request to the MCP server
    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            print(f"[MCP EXECUTION] Sending request to {server.base_url}...")
            response = await client.post(
                server.base_url,
                json=jsonrpc_request,
                headers=headers
            )
            print(f"[MCP EXECUTION] Response Status: {response.status_code}")
            
            response.raise_for_status()
            response_json = response.json()
            print(f"[MCP EXECUTION] Response Body: {json.dumps(response_json, indent=2)}")
            return response_json
        except httpx.HTTPStatusError as e:
            print(f"[MCP EXECUTION] HTTP Error: {e.response.text}")
            raise
        except Exception as e:
            print(f"[MCP EXECUTION] Error: {str(e)}")
            raise



def transform_value(value: Any, target_type: str) -> Any:
    """
    Transform a value to the target type.
    Used for converting string inputs to numbers/booleans/json.
    """
    if value is None:
        return None
        
    target_type = target_type.lower()
    
    if target_type == "string":
        return str(value)
        
    elif target_type == "number":
        if isinstance(value, (int, float)):
            return value
        try:
            return float(str(value).strip())
        except:
            return value # Return original if fails
            
    elif target_type == "integer":
        if isinstance(value, int):
            return value
        try:
            return int(float(str(value).strip()))
        except:
            return value
            
    elif target_type == "boolean":
        if isinstance(value, bool):
            return value
        s = str(value).lower().strip()
        return s in ("true", "1", "yes", "on")
        
    elif target_type == "json":
        if isinstance(value, (dict, list)):
            return value
        try:
            import json
            return json.loads(str(value))
        except:
            return value
            
    return value


# =============================================================================
# Pipeline Executor (Section 3 of ToolBuilder.md)
# =============================================================================

class PipelineExecutor:
    """
    Executes declarative JSON pipelines with variable resolution.
    
    Implements Section 3.2 Execution Logic from ToolBuilder.md:
    1. Context Initialization with input parameters
    2. Sequential iteration through pipeline steps
    3. Variable resolution ({{ input.x }}, {{ step_id.result.x }}, {{ env.x }})
    4. Atomic MCP function execution
    5. Context updates after each step
    6. Fail-fast error handling with configurable timeout
    """
    
    def __init__(self, db: Session, tool_id: int, timeout: float = 30.0):
        """
        Initialize the pipeline executor for a specific tool.
        
        Args:
            db: Database session
            tool_id: ID of the tool to execute
            timeout: Global timeout in seconds (default: 30s per spec)
        """
        self.db = db
        self.tool_id = tool_id
        self.timeout = timeout
        self.context: Dict[str, Any] = {}  # Memory context for variable resolution
        self.tool: Optional[Tool] = None
    
    def load_tool(self) -> Tool:
        """Load the tool from the database."""
        self.tool = self.db.query(Tool).filter(Tool.id == self.tool_id).first()
        if not self.tool:
            raise ValueError(f"Tool with ID {self.tool_id} not found")
        return self.tool
    
    def get_pipeline(self) -> List[Dict[str, Any]]:
        """
        Get the pipeline from tool configuration.
        
        Returns:
            List of pipeline steps
        """
        if not self.tool or not self.tool.configuration:
            return []
        return self.tool.configuration.get("pipeline", [])
    
    def resolve_variables(self, value: Any) -> Any:
        """
        Resolve {{ placeholder }} syntax in a value.
        
        Supports:
        - {{ input.field }}
        - {{ step_id.result.field }}
        - {{ step_id[0].field }} (Array access)
        - {{ env.VAR }}
        
        Args:
            value: The value to resolve
            
        Returns:
            Resolved value
        """
        import re
        import os
        
        if isinstance(value, str):
            # Pattern matches:
            # - identifiers (a_b)
            # - dot notation (.field)
            # - array index ([0])
            # - combinations (step1[0].field.sub[1])
            pattern = r'\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*(?:(?:\.[a-zA-Z_][a-zA-Z0-9_]*)|(?:\[\d+\]))*)\s*\}\}'
            
            def parse_path(path_str):
                # Split by dot, but handle array indices
                # "a.b[0].c" -> ["a", "b", "[0]", "c"]
                # Regex to split: keep delimiters
                parts = []
                # First split by dot
                dot_segments = path_str.split('.')
                for segment in dot_segments:
                    # Check for array indices in segment like "field[0][1]"
                    # Use regex to find all [N] occurrences
                    indices = list(re.finditer(r'\[(\d+)\]', segment))
                    
                    if not indices:
                        parts.append(segment)
                        continue
                        
                    # Has indices. Append the base name (if any) before the first index
                    base_end = indices[0].start()
                    if base_end > 0:
                        parts.append(segment[:base_end])
                    
                    # Append indices
                    for i, match in enumerate(indices):
                        parts.append(int(match.group(1)))
                        # If there's text between indices (unlikely but possible), append it?
                        # Standard JS/Python syntax doesn't allow field[0]field2[1] without dot
                        # So we assume contiguous indices are fine.
                        
                return parts

            def get_value_at_path(full_path):
                parts = parse_path(full_path)
                if not parts:
                    raise ValueError(f"Invalid path: {full_path}")
                
                start_node = parts[0]
                remaining_parts = parts[1:]
                
                current = None
                
                # Determine context root
                if start_node == "env":
                    if not remaining_parts:
                         raise ValueError("Environment variable name missing")
                    env_var = str(remaining_parts[0])
                    val = os.environ.get(env_var)
                    if val is None:
                        raise ValueError(f"Environment variable '{env_var}' not found")
                    return val
                    
                elif start_node == "input":
                    if "input" not in self.context:
                        raise ValueError("No input context available")
                    current = self.context["input"]
                    
                elif start_node in self.context:
                    # Step result
                    step_data = self.context[start_node]
                    
                    # Handle implicit 'result' unwrapping
                    # If step_data is wrapper {"result": ...}
                    # And next part is NOT 'result', unwrap it
                    if isinstance(step_data, dict) and "result" in step_data:
                        # Check if we should unwrap
                        should_unwrap = True
                        if remaining_parts and remaining_parts[0] == "result":
                             should_unwrap = False
                        
                        if should_unwrap:
                            current = step_data["result"]
                        else:
                            current = step_data
                    else:
                        current = step_data
                else:
                    raise ValueError(f"Context '{start_node}' not found (executed steps: {list(self.context.keys())})")

                # Traverse remaining parts
                for part in remaining_parts:
                    if current is None:
                        # Path continues but we hit None
                        raise ValueError(f"Value at '{start_node}...' is null, cannot get '{part}'")
                    
                    if isinstance(part, int): # Array index
                        if isinstance(current, (list, tuple)):
                            if 0 <= part < len(current):
                                current = current[part]
                            else:
                                raise ValueError(f"Index {part} out of bounds (len: {len(current)})")
                        else:
                             # Try to look into 'result' if we are at a dict that looks like a step wrapper
                             # (Matches edge case where implicit unwrap didn't happen because logic above applied to ROOT only)
                             if isinstance(current, dict) and "result" in current and isinstance(current["result"], (list, tuple)):
                                 current = current["result"]
                                 if 0 <= part < len(current):
                                     current = current[part]
                                 else:
                                     raise ValueError(f"Index {part} out of bounds")
                             else:
                                 raise ValueError(f"Cannot index non-list value: {type(current)}")
                                 
                    else: # String key
                        if isinstance(current, list):
                            # Auto-Unwrap Strategy:
                            # If we try to access a field "x" on a list [obj], assume user meant [0].x
                            if len(current) == 1 and isinstance(current[0], dict) and part in current[0]:
                                current = current[0][part]
                                # We could log a warning here if we had a logger
                            else:
                                raise ValueError(f"Cannot access field '{part}' on a list of length {len(current)}. Did you mean to use an index like '[0]'?")
                             
                        elif isinstance(current, dict):
                            if part in current:
                                current = current[part]
                            elif "result" in current and isinstance(current["result"], dict) and part in current["result"]:
                                # Implicit unwrap for nested objects
                                current = current["result"][part]
                            else:
                                raise ValueError(f"Field '{part}' not found")
                        else:
                            raise ValueError(f"Field '{part}' not found")
                
                return current

            def replace_match(match):
                var_path = match.group(1)
                try:
                    # Log what we are trying to resolve
                    print(f"[DEBUG] Resolving variable: {var_path}")
                    val = get_value_at_path(var_path)
                    print(f"[DEBUG] Resolved {var_path} -> {val}")
                    return str(val) if not isinstance(val, str) else val
                except ValueError as e:
                    print(f"[ERROR] Failed to resolve {var_path}: {e}")
                    raise e # Propagate error to fail verification
                except Exception as e:
                    print(f"[CRITICAL] Unexpected error resolving {var_path}: {e}")
                    traceback.print_exc()
                    raise e
            
            # Check if full match (return raw object)
            full_match = re.fullmatch(pattern, value.strip())
            if full_match:
                var_path = full_match.group(1)
                print(f"[DEBUG] Full match resolution: {var_path}")
                return get_value_at_path(var_path)
            
            # String replacement
            return re.sub(pattern, replace_match, value)
        
        elif isinstance(value, dict):
            resolved_dict = {}
            for k, v in value.items():
                resolved_key = self.resolve_variables(k) if isinstance(k, str) and "{{" in k else k
                resolved_value = self.resolve_variables(v)
                resolved_dict[resolved_key] = resolved_value
            return resolved_dict
        
        elif isinstance(value, list):
            return [self.resolve_variables(item) for item in value]
        
        else:
            return value
    
    def get_mcp_server(self, server_id: str) -> Optional[MCPServer]:
        """
        Get an MCP server by ID.
        
        Args:
            server_id: Server ID (from function_ref)
            
        Returns:
            MCPServer or None
        """
        try:
            server_id_int = int(server_id)
            return self.db.query(MCPServer).filter(
                MCPServer.id == server_id_int
            ).first()
        except ValueError:
            # Fallback 1: Try exact name
            server = self.db.query(MCPServer).filter(
                MCPServer.name == server_id
            ).first()
            if server:
                return server

            # Fallback 2: Try case-insensitive and partial matching
            # Get all servers (valid for small numbers of servers)
            all_servers = self.db.query(MCPServer).all()
            
            # 2a. Case-insensitive exact match
            for s in all_servers:
                if s.name.lower() == server_id.lower():
                    return s
            
            # 2b. Partial match (if server_id is in name or name is in server_id)
            for s in all_servers:
                if server_id.lower() in s.name.lower() or s.name.lower() in server_id.lower():
                    return s
            
            return None
    
    async def execute_step(self, step: Dict[str, Any]) -> Dict[str, Any]:
        """
        Execute a single pipeline step.
        
        Args:
            step: Pipeline step definition with step_id, function_ref, arguments
            
        Returns:
            The result of the MCP function call
            
        Raises:
            ValueError: If function_ref is invalid or server not found
        """
        step_id = step.get("step_id", "unknown")
        function_ref = step.get("function_ref", "")
        arguments = step.get("arguments", {})
        
        # Parse function_ref: "server_id.function_name"
        if "." not in function_ref:
            raise ValueError(
                f"Step '{step_id}': Invalid function_ref format. "
                f"Expected 'server_id.function_name', got '{function_ref}'"
            )
        
        parts = function_ref.split(".", 1)
        server_id = parts[0]
        function_name = parts[1]
        
        # Get the MCP server
        server = self.get_mcp_server(server_id)
        if not server:
            raise ValueError(f"Step '{step_id}': MCP server '{server_id}' not found")
        
        # Log Expected Schema if available
        if self.tool and self.tool.configuration:
            selected_functions = self.tool.configuration.get("selected_functions", [])
            # Find the function info
            func_info = None
            # Check both structure formats (list of objects or list of strings)
            for f in selected_functions:
                if isinstance(f, dict):
                    if f.get("name") == function_name and str(f.get("serverId", "")) == str(server_id):
                        func_info = f
                        break
            
            if func_info and "inputSchema" in func_info:
                print(f"[MCP EXECUTION] Expected Input Schema for '{function_name}':")
                print(json.dumps(func_info["inputSchema"], indent=2))
            else:
                print(f"[MCP EXECUTION] Could not find schema for function '{function_name}' in tool configuration.")

        # Resolve variables in arguments
        resolved_args = self.resolve_variables(arguments)
        
        # Apply Type Transformations if configured (Crucial for fixing string-to-number mismatches)
        if self.tool and self.tool.configuration:
            type_transformations = self.tool.configuration.get("type_transformations", {})
            if type_transformations:
                # print(f"[DEBUG] Applying type transformations for {step_id}: {type_transformations}")
                for arg_name, arg_value in resolved_args.items():
                    # Check for specific step transformation: "step1.latitude"
                    target_type = type_transformations.get(f"{step_id}.{arg_name}")
                    
                    if target_type:
                        try:
                            resolved_args[arg_name] = transform_value(arg_value, target_type)
                            # print(f"[DEBUG] Transformed '{arg_name}': {arg_value} -> {resolved_args[arg_name]} ({target_type})")
                        except Exception as e:
                            print(f"[WARN] Failed to transform '{arg_name}': {e}")
        
        # Apply Type Transformations if configured
        # This fixes issues where variables are resolved as strings but tool expects numbers
        if self.tool and self.tool.configuration:
            type_transformations = self.tool.configuration.get("type_transformations", {})
            if type_transformations:
                print(f"[DEBUG] Applying type transformations: {type_transformations}")
                for arg_name, arg_value in resolved_args.items():
                    # Check for specific step transformation: "step1.latitude"
                    # Or generic transformation: "latitude" (fallback)
                    target_type = type_transformations.get(f"{step_id}.{arg_name}")
                    if not target_type:
                        target_type = type_transformations.get(arg_name)
                    
                    if target_type:
                        try:
                            resolved_args[arg_name] = transform_value(arg_value, target_type)
                            print(f"[DEBUG] Transformed '{arg_name}': {arg_value} -> {resolved_args[arg_name]} ({target_type})")
                        except Exception as e:
                            print(f"[WARN] Failed to transform '{arg_name}': {e}")
        
        # Execute the MCP function
        response = await execute_mcp_function(server, function_name, resolved_args)
        
        # Check for errors in response
        if "error" in response:
            error = response["error"]
            error_msg = error.get("message", "Unknown MCP error")
            raise ValueError(f"Step '{step_id}': MCP error - {error_msg}")
        
        # Extract result
        mcp_result = response.get("result", {})
        
        # Check if MCP returned an error in result
        if isinstance(mcp_result, dict) and mcp_result.get("isError"):
            content = mcp_result.get("content", [])
            if content and isinstance(content[0], dict):
                error_text = content[0].get("text", "Unknown error")
            else:
                error_text = str(content)
            raise ValueError(f"Step '{step_id}': {error_text}")
        
        # Flatten and Parse Result (e.g. JSON strings inside text)
        return self._flatten_mcp_result(mcp_result)
    
    async def execute(
        self,
        input_params: Dict[str, Any],
        request_id: int = 1,
        include_trace: bool = False
    ) -> Dict[str, Any]:
        """
        Execute the complete pipeline with given input parameters.
        
        Args:
            input_params: Runtime input parameters for the tool
            request_id: Request ID for JSON-RPC response
            
        Returns:
            Standardized JSON-RPC 2.0 response (success or error)
        """
        import asyncio
        
        try:
            # Load tool
            self.load_tool()
            
            # Get pipeline
            pipeline = self.get_pipeline() # Ensure pipeline is loaded
            
            if not pipeline:
                # No pipeline - fall back to legacy single-function execution
                return format_error_response(
                    request_id,
                    "No pipeline configured for this tool"
                )
            
            # Step 1: Context Initialization
            self.context = {"input": input_params}
            
            # Step 2: Sequential Iteration with timeout
            final_result = None
            trace = []
            
            async def run_pipeline():
                nonlocal final_result
                for i, step in enumerate(pipeline):
                    # Align with DryRun naming: step{i} (no underscore) if running from array
                    # But DryRun starts indices effectively at 0 (current_step_index)
                    # Note: DryRun creates next_step_id = f"step{session.current_step_index + 1}"
                    # This means step 0 is weird case.
                    # Wait, if DryRun creates step indices 1-based for IDs?
                    # The DryRun logic was: next_step_index = session.current_step_index + 1
                    # If index is 0, next is 1. Next step ID is step1.
                    # So pipeline[1] gets ID step1.
                    # pipeline[0] gets ID... unknown?
                    # But usually steps in pipeline have IDs if saved.
                    
                    # Safest bet: Use step{i} or step{i+1}?
                    # If I use step_{i}, it definitely mismatches key "stepX".
                    # Let's use step{i} (no underscore) as a baseline fix for now.
                    step_id = step.get("step_id", f"step{i}")
                    
                    # IMPORTANT: Inject step_id back into step so execute_step can find it
                    # This is critical for type transformation lookups which key off step_id
                    if "step_id" not in step:
                        step = step.copy() # Don't mutate original pipeline
                        step["step_id"] = step_id

                    trace_item = {
                        "step_id": step_id,
                        "function_ref": step.get("function_ref"),
                        "status": "pending",
                        "input": step.get("arguments", {}),  # Raw arguments before resolution
                        "output": None,
                        "error": None
                    }
                    
                    try:
                        # Step 4: Atomic Execution
                        # We might need resolved args for trace?
                        # Capturing resolved args implies resolving them before execution call 
                        # but execute_step does both.
                        # For now, we rely on execute_step to run.
                        
                        result = await self.execute_step(step)
                        
                        # Step 5: Context Update - store result under step_id
                        self.context[step_id] = {"result": result}
                        
                        # Track final result
                        final_result = result
                        
                        trace_item["status"] = "success"
                        trace_item["output"] = result
                    
                    except Exception as e:
                        trace_item["status"] = "failed"
                        trace_item["error"] = str(e)
                        trace.append(trace_item)
                        raise e
                    
                    trace.append(trace_item)
            
            
            # Step 6: Termination - apply global timeout
            try:
                await asyncio.wait_for(
                    run_pipeline(),
                    timeout=self.timeout
                )
            except asyncio.TimeoutError:
                return format_error_response(
                    request_id,
                    f"Pipeline execution timed out after {self.timeout} seconds"
                )
            
            # Transform final result to conform to output schema
            output_schema = self.get_output_schema()
            if output_schema:
                # Pass the entire context so we can map from all steps
                final_result = self.transform_to_output_schema(output_schema)
            
            # Return the result of the final step
            response = format_success_response(request_id, final_result)
            
            if include_trace:
                response["result"]["_execution_trace"] = trace
                
            return response
            
        except ValueError as ve:
            # Validation or resolution error - fail fast
            return format_error_response(request_id, f"PipelineError: {str(ve)}")
        except Exception as e:
            tb = traceback.format_exc()
            return format_error_response(
                request_id,
                f"PipelineError: {type(e).__name__}: {str(e)}"
            )
    
    def get_output_schema(self) -> Optional[Dict[str, Any]]:
        """
        Get the output schema from tool configuration.
        
        Returns:
            Output schema dict or None if not defined
        """
        if not self.tool or not self.tool.configuration:
            return None
        return self.tool.configuration.get("output_schema")
    
    def transform_to_output_schema(
        self, 
        output_schema: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Transform the pipeline context to conform to the output schema.
        
        Uses the full pipeline context (self.context) containing all step results
        to build the output according to the defined schema.
        
        Args:
            output_schema: The expected output schema (JSON Schema format)
            
        Returns:
            Transformed result conforming to the output schema
        """
        # Handle Array output schema
        if output_schema.get("type") == "array":
            # Check for explicit root mapping
            output_mappings = {}
            if self.tool and self.tool.configuration:
                output_mappings = self.tool.configuration.get("output_mappings", {})
            
            if "__root__" in output_mappings:
                source_path = output_mappings["__root__"]
                return self._resolve_source_reference(source_path) or []
            
            # Fallback: Try to find a list in the last step result
            last_step_result = self._get_last_step_result()
            
            # If last step result IS a list, return it
            if isinstance(last_step_result, list):
                return last_step_result
                
            # If last step result is a dict, look for list wrapper keys
            if isinstance(last_step_result, dict):
                # Try flattened form
                flattened = self._flatten_mcp_result(last_step_result)
                if "result_list" in flattened:
                    return flattened["result_list"]
                if "items" in flattened and isinstance(flattened["items"], list):
                    return flattened["items"]
                
                # Look for any key that holds a list
                for k, v in flattened.items():
                    if isinstance(v, list) and len(v) > 0:
                        return v

            return []

        # Get the properties defined in the output schema
        properties = output_schema.get("properties", {})
        
        if not properties:
            # No specific properties defined, return last step result
            last_step_result = self._get_last_step_result()
            return last_step_result if last_step_result else {}
        
        # Helper to set nested value
        def _set_nested_value(obj: Dict[str, Any], path: str, value: Any):
            parts = path.split('.')
            current = obj
            for i, part in enumerate(parts[:-1]):
                if part not in current:
                    current[part] = {}
                current = current[part]
                if not isinstance(current, dict):
                    # Conflict: Trying to traverse into a non-dict
                    # e.g. path="a.b", but "a" is already set to a string
                    # Force overwrite or fail? For now, we might need to convert to dict or warn.
                    # As a safe fallback for mixed mapping types, we stop or overwrite?
                    # Let's assume schema compliance is ensured by user.
                    # We can't traverse.
                    return 
            
            current[parts[-1]] = value

        # Check if we have explicit output mappings from dry-run verification
        output_mappings = None
        if self.tool and self.tool.configuration:
            output_mappings = self.tool.configuration.get("output_mappings", {})
        
        # Build the conformant output with values from context
        conformant_output = {}
        
        # Phase 1: Apply Explicit Output Mappings (support nested keys like 'weather.temp')
        if output_mappings:
            for target_path, source_ref in output_mappings.items():
                if target_path == "__root__":
                    continue
                
                # Resolve value from pipeline context
                val = self._resolve_source_reference(source_ref)
                
                if val is not None:
                    # Apply type type transformations for output fields
                    transform_key = f"output.{target_path}"
                    if self.tool and self.tool.configuration:
                         type_transformations = self.tool.configuration.get("type_transformations", {})
                         if transform_key in type_transformations:
                             try:
                                 target_type = type_transformations[transform_key]
                                 val = transform_value(val, target_type)
                             except Exception:
                                 pass # Keep original value on failure

                    _set_nested_value(conformant_output, target_path, val)
        
        # Phase 2: Heuristic Filling (Top-Level Properties only, to preserve backward compatibility)
        # Only fill if not already populated by explicit mapping
        for prop_name, prop_def in properties.items():
            # If property already exists (via explicit nested mapping or direct mapping), skip matching
            if prop_name in conformant_output:
                continue
                
            value = None
            
            # (Old explicit check removed as it's handled in Phase 1, but we check if we missed it?)
            if output_mappings and prop_name in output_mappings:
                 # Should have been handled by Phase 1
                 pass
            else:
                # Value not set, try heuristics
                value = self._extract_property_value(prop_name, prop_def)
            
            if value is not None:
                conformant_output[prop_name] = value
            elif "default" in prop_def and prop_name not in conformant_output:
                conformant_output[prop_name] = prop_def["default"]
        
        # If we couldn't extract any fields, include all step results
        if not conformant_output:
            return self._get_all_step_results()
        
        return conformant_output
    
    def _get_last_step_result(self) -> Optional[Dict[str, Any]]:
        """Get the result from the last executed step."""
        # Find all step IDs in context (exclude 'input')
        step_ids = [k for k in self.context.keys() if k != "input"]
        if not step_ids:
            return None
        # Get the last step's result
        last_step_id = step_ids[-1]
        step_data = self.context.get(last_step_id, {})
        return step_data.get("result")
    
    def _get_all_step_results(self) -> Dict[str, Any]:
        """Get all step results from context."""
        results = {}
        for key, value in self.context.items():
            if key == "input":
                continue
            if isinstance(value, dict) and "result" in value:
                results[key] = value["result"]
        return results
    
    def _extract_property_value(
        self, 
        prop_name: str, 
        prop_def: Dict[str, Any]
    ) -> Any:
        """
        Extract a property value from the pipeline context.
        
        Tries multiple strategies:
        1. Check for $ref or source in property definition (e.g., "step1.result.field")
        2. Check if property name matches a step_id directly
        3. Search through all step results for the property name
        4. Extract from MCP content arrays
        
        Args:
            prop_name: Property name from output schema
            prop_def: Property definition from output schema
            
        Returns:
            Extracted value or None
        """
        import re
        
        # Strategy 1: Check for explicit source reference in property definition
        source_ref = prop_def.get("$source") or prop_def.get("source")
        if source_ref:
            return self._resolve_source_reference(source_ref)
        
        # Strategy 2: Check if prop_name matches a step_id (e.g., "step1" or "Step1")
        # Handle case variations: step1, Step1, step_1, Step 1
        normalized_prop = prop_name.lower().replace(" ", "").replace("_", "")
        for step_id in self.context.keys():
            if step_id == "input":
                continue
            normalized_step = step_id.lower().replace(" ", "").replace("_", "")
            if normalized_prop == normalized_step or normalized_prop == f"{normalized_step}result":
                step_data = self.context.get(step_id, {})
                result = step_data.get("result")
                if result is not None:
                    # Check if prop_def has nested properties to extract
                    nested_props = prop_def.get("properties")
                    if nested_props:
                        return self._build_nested_output(result, nested_props)
                    # Extract text content if MCP format
                    return self._extract_content(result)
        
        # Strategy 3: Search through all step results for the property
        for step_id, step_data in self.context.items():
            if step_id == "input":
                continue
            result = step_data.get("result") if isinstance(step_data, dict) else None
            if result is None:
                continue
            
            # Direct match in result
            if isinstance(result, dict) and prop_name in result:
                return result[prop_name]
            
            # Check nested content
            if isinstance(result, dict):
                # Check in 'content' array (MCP format)
                content = result.get("content")
                if isinstance(content, list):
                    for item in content:
                        if isinstance(item, dict):
                            if prop_name in item:
                                return item[prop_name]
                            # Check if text matches property expectation
                            if "text" in item and prop_name.lower() in ["text", "result", "output"]:
                                return item["text"]
        
        # Strategy 4: For step-based properties like "step2_result", look up step2
        step_match = re.match(r'step[_\s]?(\d+)[_\s]?result', prop_name.lower())
        if step_match:
            step_num = step_match.group(1)
            # Try different step naming formats
            for fmt in [f"step{step_num}", f"step_{step_num}", f"Step{step_num}"]:
                if fmt in self.context:
                    result = self.context[fmt].get("result")
                    if result is not None:
                        # Check if prop_def has nested properties to extract
                        nested_props = prop_def.get("properties")
                        if nested_props:
                            return self._build_nested_output(result, nested_props)
                        return self._extract_content(result)
        
        return None
    
    def _build_nested_output(
        self, 
        mcp_result: Dict[str, Any], 
        nested_props: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Build a nested output object by mapping MCP result fields to schema properties.
        
        Uses heuristics to match schema property names to actual MCP field names:
        - Direct name match
        - Common field mappings (image -> url, capital -> text, etc.)
        - Type-based matching
        
        Args:
            mcp_result: The raw MCP result (may have content array)
            nested_props: The nested properties from output schema
            
        Returns:
            Dict with schema property names mapped to actual values
        """
        nested_output = {}
        
        # Extract actual data from MCP result
        actual_data = self._flatten_mcp_result(mcp_result)
        
        # Common field name mappings (schema_name -> possible_actual_names)
        field_mappings = {
            "image": ["url", "image_url", "imageUrl", "src", "source"],
            "capital_image": ["url", "image_url", "imageUrl", "src", "source"],
            "country_capital": ["text", "message", "result", "capital", "name", "value"],
            "capital": ["text", "message", "result", "capital", "name", "value"],
            "result": ["text", "message", "result", "value", "data"],
            "text": ["text", "message", "content"],
            "url": ["url", "href", "link", "src"],
            "name": ["name", "title", "label"],
            "value": ["value", "result", "text"],
        }
        
        for prop_name, prop_def in nested_props.items():
            value = None
            
            # Try direct match first
            if prop_name in actual_data:
                value = actual_data[prop_name]
            else:
                # Try mapped field names
                possible_names = field_mappings.get(prop_name.lower(), [])
                for possible_name in possible_names:
                    if possible_name in actual_data:
                        value = actual_data[possible_name]
                        break
                
                # If still not found, try partial matches
                if value is None:
                    prop_lower = prop_name.lower()
                    for actual_name, actual_value in actual_data.items():
                        actual_lower = actual_name.lower()
                        # Check if property name is contained in actual name or vice versa
                        if prop_lower in actual_lower or actual_lower in prop_lower:
                            value = actual_value
                            break
            
            if value is not None:
                nested_output[prop_name] = value
            elif "default" in prop_def:
                nested_output[prop_name] = prop_def["default"]
        
        # If we couldn't extract any nested properties, return the extracted content as fallback
        if not nested_output:
            extracted = self._extract_content(mcp_result)
            if extracted is not None:
                return extracted
        
        return nested_output
    
    def _flatten_mcp_result(self, mcp_result: Any) -> Any:
        """
        Flatten an MCP result into a simple key-value dict or list.
        
        Handles:
        - {"content": [{"type": "text", "text": {...}}]} -> flattens text object
        - {"content": [{"type": "text", "text": "string"}]} -> {"text": "string"}
        - {"content": [{"text": "[...]"}]} -> returns parsed List
        - Direct dict -> returns as-is
        """
        if not isinstance(mcp_result, dict):
            return {"value": mcp_result}
        
        flattened = dict(mcp_result)  # Start with all top-level keys
        
        # Handle MCP content array
        content = mcp_result.get("content")
        if isinstance(content, list):
            for item in content:
                if isinstance(item, dict):
                    # Extract 'text' field which may be string or object
                    text_data = item.get("text")
                    if isinstance(text_data, dict):
                        # Merge text object fields into flattened
                        flattened.update(text_data)
                    elif isinstance(text_data, str):
                        flattened["text"] = text_data
                        # Try to parse JSON string
                        try:
                            import json
                            trimmed = text_data.strip()
                            if trimmed.startswith("{") or trimmed.startswith("["):
                                parsed = json.loads(text_data)
                                if isinstance(parsed, dict):
                                    flattened.update(parsed)
                                elif isinstance(parsed, list):
                                    # If the main content is a list, return it directly!
                                    return parsed
                        except:
                            pass
                    
                    # Also include other fields from content item
                    for k, v in item.items():
                        if k not in flattened:
                            flattened[k] = v
        
        return flattened
    
    def _resolve_source_reference(self, source_ref: str) -> Any:
        """
        Resolve a source reference like "step1.result.field" or "step1.content[0].text".
        
        Supports:
        - Dot notation: step1.result.field
        - Array indices: step1.content[0].text
        - Mixed: step1.content[0].text.field[2]
        
        Args:
            source_ref: Reference string (e.g., "step1.content[0].text.field")
            
        Returns:
            Resolved value or None
        """
        import re
        
        if not source_ref:
            return None
            
        # Parse the path into segments, handling array notation
        # e.g., "step1.content[0].text[1].field" -> ["step1", "content", "[0]", "text", "[1]", "field"]
        segments = []
        for part in source_ref.split("."):
            # Check for array index notation like "content[0]"
            match = re.match(r'^([^\[]+)(\[\d+\])?$', part)
            if match:
                field_name = match.group(1)
                array_index = match.group(2)
                if field_name:
                    segments.append(field_name)
                if array_index:
                    segments.append(array_index)
            else:
                segments.append(part)
        
        if not segments:
            return None
        
        current = self.context
        for segment in segments:
            if current is None:
                return None
            
            # Handle JSON string parsing
            if isinstance(current, str):
                try:
                    import json
                    # Only attempt to parse if we are looking for a property/index
                    # and the current string looks like JSON (starts with { or [)
                    trimmed = current.strip()
                    if trimmed.startswith("{") or trimmed.startswith("["):
                        parsed = json.loads(current)
                        current = parsed
                except:
                    # Not valid JSON, continue to check if it matches as is (unlikely for string)
                    pass

            # Handle array index notation [N]
            if segment.startswith("[") and segment.endswith("]"):
                try:
                    index = int(segment[1:-1])
                    if isinstance(current, (list, tuple)) and 0 <= index < len(current):
                        current = current[index]
                    else:
                        return None
                except (ValueError, IndexError):
                    return None
            
            # Handle dict key access
            elif isinstance(current, dict):
                if segment in current:
                    current = current[segment]
                # Implicitly unwrap 'result' if the key is not found directly
                # This handles paths like "step1.content" where step1 -> {"result": {"content": ...}}
                elif "result" in current and isinstance(current["result"], dict) and segment in current["result"]:
                    current = current["result"][segment]
                else:
                    return None
            else:
                return None
                
        return current
                
        return current
    
    def _extract_content(self, result: Any) -> Any:
        """
        Extract meaningful content from an MCP result.
        
        Handles common MCP response formats like:
        - {"content": [{"type": "text", "text": "..."}]}
        - {"result": "..."}
        - Direct value
        
        Args:
            result: Raw MCP result
            
        Returns:
            Extracted content
        """
        if not isinstance(result, dict):
            return result
        
        # MCP content array format
        content = result.get("content")
        if isinstance(content, list):
            texts = []
            for item in content:
                if isinstance(item, dict) and "text" in item:
                    texts.append(item["text"])
            if texts:
                return texts[0] if len(texts) == 1 else texts
        
        # Nested result format
        if "result" in result and not isinstance(result.get("result"), dict):
            return result["result"]
        
        # Return as-is
        return result


class ToolRuntime:
    """
    Runtime execution environment for tools.
    
    Handles the complete lifecycle of tool execution:
    1. Load tool configuration and find target MCP server
    2. Validate input parameters against schema
    3. Execute function on MCP server
    4. Capture output and exceptions
    5. Return standardized response
    """
    
    def __init__(self, db: Session, tool_id: int):
        """
        Initialize the runtime for a specific tool.
        
        Args:
            db: Database session
            tool_id: ID of the tool to execute
        """
        self.db = db
        self.tool_id = tool_id
        self.tool: Optional[Tool] = None
        self.request_id: int = 1
    
    def load_tool(self) -> Tool:
        """Load the tool from the database."""
        self.tool = self.db.query(Tool).filter(Tool.id == self.tool_id).first()
        if not self.tool:
            raise ValueError(f"Tool with ID {self.tool_id} not found")
        return self.tool
    
    def get_function_schema(self, function_name: str) -> Optional[Dict[str, Any]]:
        """
        Get the input schema for a specific function from the tool configuration.
        
        Args:
            function_name: Name of the function
        
        Returns:
            The input schema for the function, or None if not found
        """
        if not self.tool or not self.tool.configuration:
            return None
        
        # Configuration should contain selected functions with their schemas
        selected_functions = self.tool.configuration.get("selected_functions", [])
        for func in selected_functions:
            if func.get("name") == function_name:
                return func.get("inputSchema")
        
        return None
    
    def get_mcp_server_for_function(self, function_name: str) -> Optional[MCPServer]:
        """
        Find the MCP server that provides a specific function.
        
        Args:
            function_name: Name of the function
        
        Returns:
            The MCPServer object, or None if not found
        """
        if not self.tool or not self.tool.configuration:
            return None
        
        # Configuration should map functions to servers
        server_functions = self.tool.configuration.get("server_functions", {})
        for server_id_str, functions in server_functions.items():
            if function_name in functions:
                server_id = int(server_id_str)
                return self.db.query(MCPServer).filter(
                    MCPServer.id == server_id
                ).first()
        
        # Fallback: try connected_servers list
        connected_servers = self.tool.configuration.get("connected_servers", [])
        if connected_servers:
            server_id = connected_servers[0]
            return self.db.query(MCPServer).filter(
                MCPServer.id == server_id
            ).first()
        
        return None
    
    def validate_params(
        self,
        params: Dict[str, Any],
        schema: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Validate parameters against a JSON Schema using Pydantic.
        
        Args:
            params: The parameters to validate
            schema: The JSON Schema to validate against
        
        Returns:
            The validated parameters (possibly with defaults applied)
        
        Raises:
            ValidationError: If parameters are invalid
        """
        if not schema:
            return params
        
        model = create_pydantic_model_from_schema(schema, "ParamsModel")
        validated = model(**params)
        return validated.dict()
    
    def _flatten_mcp_result(self, mcp_result: Any) -> Any:
        """
        Flatten an MCP result into a simple key-value dict or list.
        
        Handles:
        - {"content": [{"type": "text", "text": {...}}]} -> flattens text object
        - {"content": [{"type": "text", "text": "string"}]} -> {"text": "string"}
        - {"content": [{"text": "[...]"}]} -> returns parsed List
        - Direct dict -> returns as-is
        """
        if not isinstance(mcp_result, dict):
            return mcp_result
        
        flattened = dict(mcp_result)  # Start with all top-level keys
        
        # Handle MCP content array
        content = mcp_result.get("content")
        if isinstance(content, list):
            for item in content:
                if isinstance(item, dict):
                    # Extract 'text' field which may be string or object
                    text_data = item.get("text")
                    if isinstance(text_data, dict):
                        # Merge text object fields into flattened
                        flattened.update(text_data)
                    elif isinstance(text_data, str):
                        flattened["text"] = text_data
                        # Try to parse JSON string
                        try:
                            import json
                            trimmed = text_data.strip()
                            print(f"[DEBUG FLATTEN] Text start: {trimmed[:50]}")
                            if trimmed.startswith("{") or trimmed.startswith("["):
                                parsed = json.loads(text_data)
                                print(f"[DEBUG FLATTEN] Parsed type: {type(parsed)}")
                                if isinstance(parsed, dict):
                                    flattened.update(parsed)
                                elif isinstance(parsed, list):
                                    print("[DEBUG FLATTEN] Returning LIST")
                                    return parsed
                        except Exception as e:
                            print(f"[DEBUG FLATTEN] Error: {e}")
                            pass
        return flattened

    async def run(
        self, 
        function_name: str, 
        arguments: Dict[str, Any],
        request_id: int = 1
    ) -> Dict[str, Any]:
        """
        Run the tool function.
        
        Args:
            function_name: Name of the function/tool to run
            arguments: Validated arguments
            request_id: Request ID for JSON-RPC response
            
        Returns:
            Standardized JSON-RPC 2.0 response (success or error)
        """
        self.request_id = request_id
        
        # Capture stdout/stderr
        stdout_capture = io.StringIO()
        stderr_capture = io.StringIO()
        
        try:
            # Load the tool
            self.load_tool()
            
            # Get the function schema for validation
            schema = self.get_function_schema(function_name)
            
            # Validate parameters
            try:
                validated_args = self.validate_params(arguments, schema)
            except ValidationError as ve:
                error_details = []
                for error in ve.errors():
                    field = ".".join(str(loc) for loc in error["loc"])
                    error_details.append(f"{field}: {error['msg']}")
                return format_error_response(
                    request_id,
                    f"ValidationError: {'; '.join(error_details)}"
                )
            except Exception as ve:
                return format_error_response(
                    request_id,
                    f"ValidationError: {str(ve)}"
                )
            
            # Find the MCP server
            server = self.get_mcp_server_for_function(function_name)
            if not server:
                return format_error_response(
                    request_id,
                    f"Error: No MCP server found for function '{function_name}'"
                )
            
            # Execute the function with output capture
            with redirect_stdout(stdout_capture), redirect_stderr(stderr_capture):
                try:
                    response = await execute_mcp_function(
                        server,
                        function_name,
                        validated_args
                    )
                except httpx.HTTPError as he:
                    return format_error_response(
                        request_id,
                        f"HTTPError: {str(he)}"
                    )
            
            # Check for JSON-RPC errors in response
            if "error" in response:
                error = response["error"]
                error_msg = error.get("message", "Unknown MCP error")
                return format_error_response(request_id, f"MCPError: {error_msg}")
            
            # Extract result
            result = response.get("result", {})
            
            # Check if MCP returned an error in result
            if isinstance(result, dict) and result.get("isError"):
                content = result.get("content", [])
                if content and isinstance(content[0], dict):
                    error_text = content[0].get("text", "Unknown error")
                else:
                    error_text = str(content)
                return format_error_response(request_id, error_text)
            
            # Success - return the FLATTENED result
            return format_success_response(request_id, self._flatten_mcp_result(result))
            
        except ValueError as ve:
            return format_error_response(request_id, f"ValueError: {str(ve)}")
        except Exception as e:
            # Capture full traceback
            tb = traceback.format_exc()
            stderr_output = stderr_capture.getvalue()
            
            error_msg = f"{type(e).__name__}: {str(e)}"
            if stderr_output:
                error_msg += f"\nStderr: {stderr_output}"
            
            return format_error_response(request_id, error_msg)


async def execute_tool(
    db: Session,
    tool_id: int,
    params: Dict[str, Any]
) -> Dict[str, Any]:
    """
    Main entry point for tool execution.
    
    This function is called by the router to execute a tool.
    
    Args:
        db: Database session
        tool_id: ID of the tool to execute
        params: JSON-RPC params containing 'name' and 'arguments'
    
    Returns:
        Standardized JSON-RPC 2.0 response
    """
    function_name = params.get("name")
    arguments = params.get("arguments", {})
    request_id = params.get("id", 1)
    
    if not function_name:
        return format_error_response(
            request_id,
            "Error: 'name' is required in params"
        )
    
    runtime = ToolRuntime(db, tool_id)
    return await runtime.run(function_name, arguments, request_id)


async def execute_pipeline(
    db: Session,
    tool_id: int,
    input_params: Dict[str, Any],
    request_id: int = 1,
    include_trace: bool = False
) -> Dict[str, Any]:
    """
    Execute a tool's pipeline with given input parameters.
    
    This function uses the PipelineExecutor to run declarative JSON pipelines.
    
    Args:
        db: Database session
        tool_id: ID of the tool to execute
        input_params: Runtime input parameters for the pipeline
        request_id: Request ID for JSON-RPC response
        include_trace: Whether to include execution trace in response
        
    Returns:
        Standardized JSON-RPC 2.0 response
    """
    executor = PipelineExecutor(db, tool_id)
    return await executor.execute(input_params, request_id, include_trace)

