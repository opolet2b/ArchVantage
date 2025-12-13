import requests
import json

# Get token (assuming admin/admin123 login)
login_response = requests.post(
    "http://localhost:8000/api/v1/login",
    data={"username": "admin@example.com", "password": "admin123"}
)

if login_response.status_code == 200:
    token = login_response.json()["access_token"]
    print(f"✓ Logged in successfully")
    
    # Create MCP Server
    create_response = requests.post(
        "http://localhost:8000/api/v1/mcp-servers",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "name": "Test Calculator MCP",
            "base_url": "http://localhost:9000",
            "description": "A test calculator MCP server",
            "is_active": True
        }
    )
    
    if create_response.status_code == 200:
        server = create_response.json()
        print(f"✓ Created MCP Server: {server['name']} (ID: {server['id']})")
    else:
        print(f"✗ Failed to create server: {create_response.status_code}")
        print(create_response.text)
    
    # List MCP Servers
    list_response = requests.get(
        "http://localhost:8000/api/v1/mcp-servers",
        headers={"Authorization": f"Bearer {token}"}
    )
    
    if list_response.status_code == 200:
        servers = list_response.json()
        print(f"✓ Found {len(servers)} MCP server(s)")
        for s in servers:
            print(f"  - {s['name']}: {s['base_url']}")
    else:
        print(f"✗ Failed to list servers: {list_response.status_code}")
        
else:
    print(f"✗ Login failed: {login_response.status_code}")
