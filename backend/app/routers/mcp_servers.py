from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from app.core.database import get_db
from app.routers.auth import get_current_user
from app.models.user import User
from app.models.tools import MCPServer, MCPServerPermission as MCPServerPermissionModel
from pydantic import BaseModel
import httpx

router = APIRouter()

# Pydantic schemas
class MCPServerPermission(BaseModel):
    user_id: int | None = None
    ad_group_id: int | None = None

class MCPServerCreate(BaseModel):
    name: str
    base_url: str
    description: str | None = None
    auth_type: str = "NONE"
    auth_config: dict = {}
    is_active: bool = True
    permissions: List[MCPServerPermission] = []

class MCPServerUpdate(BaseModel):
    name: str | None = None
    base_url: str | None = None
    description: str | None = None
    auth_type: str | None = None
    auth_config: dict | None = None
    is_active: bool | None = None
    permissions: List[MCPServerPermission] | None = None

class MCPServerResponse(BaseModel):
    id: int
    name: str
    base_url: str
    description: str | None
    auth_type: str
    auth_config: dict
    is_active: bool
    permissions: List[MCPServerPermission]

    class Config:
        from_attributes = True

@router.get("/mcp-servers", response_model=List[MCPServerResponse])
def get_mcp_servers(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get all MCP servers"""
    servers = db.query(MCPServer).all()
    
    # Convert to response format with permissions
    result = []
    for server in servers:
        permissions = []
        for perm in server.permissions:
            permissions.append(MCPServerPermission(
                user_id=perm.user_id,
                ad_group_id=perm.ad_group_id
            ))
        
        result.append(MCPServerResponse(
            id=server.id,
            name=server.name,
            base_url=server.base_url,
            description=server.description,
            auth_type=server.auth_type,
            auth_config=server.auth_config or {},
            is_active=server.is_active,
            permissions=permissions
        ))
    
    return result

@router.post("/mcp-servers", response_model=MCPServerResponse)
def create_mcp_server(
    server_data: MCPServerCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Create a new MCP server"""
    # Create server
    server = MCPServer(
        name=server_data.name,
        base_url=server_data.base_url,
        description=server_data.description,
        auth_type=server_data.auth_type,
        auth_config=server_data.auth_config,
        is_active=server_data.is_active
    )
    
    db.add(server)
    db.commit()
    db.refresh(server)
    
    # Add permissions
    for perm in server_data.permissions:
        db_perm = MCPServerPermissionModel(
            mcp_server_id=server.id,
            user_id=perm.user_id,
            ad_group_id=perm.ad_group_id
        )
        db.add(db_perm)
    
    db.commit()
    db.refresh(server)
    
    # Return response
    permissions = []
    for perm in server.permissions:
        permissions.append(MCPServerPermission(
            user_id=perm.user_id,
            ad_group_id=perm.ad_group_id
        ))
    
    return MCPServerResponse(
        id=server.id,
        name=server.name,
        base_url=server.base_url,
        description=server.description,
        auth_type=server.auth_type,
        auth_config=server.auth_config or {},
        is_active=server.is_active,
        permissions=permissions
    )

@router.put("/mcp-servers/{server_id}", response_model=MCPServerResponse)
def update_mcp_server(
    server_id: int,
    server_data: MCPServerUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Update an MCP server"""
    server = db.query(MCPServer).filter(MCPServer.id == server_id).first()
    if not server:
        raise HTTPException(status_code=404, detail="MCP server not found")
    
    # Update fields
    if server_data.name is not None:
        server.name = server_data.name
    if server_data.base_url is not None:
        server.base_url = server_data.base_url
    if server_data.description is not None:
        server.description = server_data.description
    if server_data.auth_type is not None:
        server.auth_type = server_data.auth_type
    if server_data.auth_config is not None:
        server.auth_config = server_data.auth_config
    if server_data.is_active is not None:
        server.is_active = server_data.is_active
    
    # Update permissions if provided
    if server_data.permissions is not None:
        # Clear existing permissions
        db.query(MCPServerPermissionModel).filter(MCPServerPermissionModel.mcp_server_id == server.id).delete()
        
        # Add new permissions
        for perm in server_data.permissions:
            db_perm = MCPServerPermissionModel(
                mcp_server_id=server.id,
                user_id=perm.user_id,
                ad_group_id=perm.ad_group_id
            )
            db.add(db_perm)
    
    db.commit()
    db.refresh(server)
    
    # Return response
    permissions = []
    for perm in server.permissions:
        permissions.append(MCPServerPermission(
            user_id=perm.user_id,
            ad_group_id=perm.ad_group_id
        ))
    
    return MCPServerResponse(
        id=server.id,
        name=server.name,
        base_url=server.base_url,
        description=server.description,
        auth_type=server.auth_type,
        auth_config=server.auth_config or {},
        is_active=server.is_active,
        permissions=permissions
    )

@router.delete("/mcp-servers/{server_id}")
def delete_mcp_server(
    server_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Delete an MCP server"""
    server = db.query(MCPServer).filter(MCPServer.id == server_id).first()
    if not server:
        raise HTTPException(status_code=404, detail="MCP server not found")
    
    db.delete(server)
    db.commit()
    
    return {"message": "MCP server deleted successfully"}

@router.post("/mcp-servers/{server_id}/test-connection")
async def test_mcp_connection(
    server_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Test connection to an MCP server following the MCP lifecycle specification.
    
    This implementation supports both:
    1. REST-style bridges (separate endpoints like /initialize, /tools/list)
    2. JSON-RPC at root (single endpoint with method in body)
    
    It tries the REST-style first, then falls back to JSON-RPC.
    """
    server = db.query(MCPServer).filter(MCPServer.id == server_id).first()
    if not server:
        raise HTTPException(status_code=404, detail="MCP server not found")
    
    try:
        # Prepare headers for authentication
        headers = {
            "Content-Type": "application/json",
            "MCP-Protocol-Version": "2024-11-05"
        }
        if server.auth_type == "API_KEY" and server.auth_config.get("api_key"):
            headers["Authorization"] = f"Bearer {server.auth_config['api_key']}"
        
        base_url = server.base_url.rstrip('/')
        
        async with httpx.AsyncClient() as client:
            # First, try REST-style endpoints (for HTTP bridges)
            try:
                # Step 1: Call /initialize endpoint
                init_response = await client.post(
                    f"{base_url}/initialize",
                    json={
                        "protocolVersion": "2024-11-05",
                        "capabilities": {},
                        "clientInfo": {
                            "name": "ChatBotApp",
                            "version": "1.0.0"
                        }
                    },
                    headers=headers,
                    timeout=10.0
                )
                
                if init_response.status_code == 200:
                    # REST-style bridge detected
                    init_data = init_response.json()
                    
                    # Step 2: Get tools list via REST endpoint
                    tools_response = await client.get(
                        f"{base_url}/tools/list",
                        headers=headers,
                        timeout=10.0
                    )
                    
                    if tools_response.status_code != 200:
                        raise HTTPException(
                            status_code=tools_response.status_code,
                            detail=f"Failed to get tools list: {tools_response.text[:200]}"
                        )
                    
                    tools_data = tools_response.json()
                    tools = tools_data.get("tools", [])
                    
                    return {
                        "success": True,
                        "mode": "REST",
                        "count": len(tools),
                        "tools": tools,
                        "serverInfo": init_data.get("serverInfo", {}),
                        "protocolVersion": init_data.get("protocolVersion", "unknown")
                    }
                    
            except httpx.HTTPStatusError:
                pass  # Fall through to JSON-RPC mode
            except Exception:
                pass  # Fall through to JSON-RPC mode
            
            # Fallback: Try JSON-RPC at root endpoint
            initialize_request = {
                "jsonrpc": "2.0",
                "id": 1,
                "method": "initialize",
                "params": {
                    "protocolVersion": "2024-11-05",
                    "capabilities": {
                        "roots": {"listChanged": True},
                        "sampling": {}
                    },
                    "clientInfo": {
                        "name": "ChatBotApp",
                        "version": "1.0.0"
                    }
                }
            }
            
            init_response = await client.post(
                base_url,
                json=initialize_request,
                headers=headers,
                timeout=10.0
            )
            
            if init_response.status_code != 200:
                raise HTTPException(
                    status_code=init_response.status_code,
                    detail=f"MCP initialization failed: Server returned {init_response.status_code}. {init_response.text[:200]}"
                )
            
            init_data = init_response.json()
            
            if "error" in init_data:
                error_msg = init_data['error'].get('message', 'Unknown error')
                raise HTTPException(
                    status_code=400,
                    detail=f"MCP initialization error: {error_msg}"
                )
            
            result = init_data.get("result", init_data)
            
            # Send initialized notification
            await client.post(
                base_url,
                json={"jsonrpc": "2.0", "method": "notifications/initialized"},
                headers=headers,
                timeout=10.0
            )
            
            # Get tools list
            tools_response = await client.post(
                base_url,
                json={"jsonrpc": "2.0", "id": 2, "method": "tools/list", "params": {}},
                headers=headers,
                timeout=10.0
            )
            
            if tools_response.status_code != 200:
                raise HTTPException(
                    status_code=tools_response.status_code,
                    detail=f"Failed to get tools: {tools_response.text[:200]}"
                )
            
            tools_data = tools_response.json()
            tools = tools_data.get("result", {}).get("tools", [])
            
            return {
                "success": True,
                "mode": "JSON-RPC",
                "count": len(tools),
                "tools": tools,
                "serverInfo": result.get("serverInfo", {}),
                "protocolVersion": result.get("protocolVersion", "unknown")
            }
            
    except httpx.TimeoutException:
        raise HTTPException(
            status_code=504,
            detail=f"Connection timed out. Check if server at {server.base_url} is running."
        )
    except httpx.ConnectError:
        raise HTTPException(
            status_code=503,
            detail=f"Cannot connect to {server.base_url}. Verify the URL and server status."
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Unexpected error: {str(e)}"
        )

# Keep the old endpoint for backwards compatibility (deprecated)
@router.post("/mcp-servers/{server_id}/discover")
async def discover_mcp_tools(
    server_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Deprecated: Use /test-connection instead.
    This endpoint redirects to the new test-connection endpoint.
    """
    return await test_mcp_connection(server_id, db, current_user)
