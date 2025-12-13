"""
Test script to verify MCP server at http://localhost:3004 follows the specification
"""
import requests
import json

def test_mcp_initialization():
    """Test the MCP initialization lifecycle"""
    
    base_url = "http://localhost:3004"
    
    print("=" * 60)
    print("Testing MCP Server Initialization")
    print("=" * 60)
    
    # Step 1: Send initialize request
    print("\nStep 1: Sending initialize request...")
    initialize_request = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "initialize",
        "params": {
            "protocolVersion": "2024-11-05",
            "capabilities": {
                "roots": {
                    "listChanged": True
                },
                "sampling": {},
                "tasks": {
                    "requests": {
                        "sampling": {
                            "createMessage": {}
                        }
                    }
                }
            },
            "clientInfo": {
                "name": "ChatBotApp",
                "version": "1.0.0"
            }
        }
    }
    
    try:
        response = requests.post(
            base_url,
            json=initialize_request,
            headers={"Content-Type": "application/json"},
            timeout=10
        )
        
        print(f"Status Code: {response.status_code}")
        print(f"Response Headers: {dict(response.headers)}")
        print(f"Raw Response: {response.text[:500]}")
        
        try:
            response_json = response.json()
            print(f"Response JSON: {json.dumps(response_json, indent=2)}")
        except json.JSONDecodeError:
            print(f"❌ Could not parse JSON response")
        
        if response.status_code != 200:
            print(f"❌ Initialization failed with status {response.status_code}")
            return
        
        init_data = response.json()
        
        if "error" in init_data:
            print(f"❌ Server returned error: {init_data['error']}")
            return
        
        print("✅ Initialize request successful")
        
        # Step 2: Send initialized notification
        print("\nStep 2: Sending initialized notification...")
        initialized_notification = {
            "jsonrpc": "2.0",
            "method": "notifications/initialized"
        }
        
        response = requests.post(
            base_url,
            json=initialized_notification,
            headers={"Content-Type": "application/json"},
            timeout=10
        )
        
        print(f"Status Code: {response.status_code}")
        print("✅ Initialized notification sent")
        
        # Step 3: Request tools list
        print("\nStep 3: Requesting tools list...")
        tools_request = {
            "jsonrpc": "2.0",
            "id": 2,
            "method": "tools/list",
            "params": {}
        }
        
        response = requests.post(
            base_url,
            json=tools_request,
            headers={"Content-Type": "application/json"},
            timeout=10
        )
        
        print(f"Status Code: {response.status_code}")
        
        try:
            response_json = response.json()
            print(f"Response JSON: {json.dumps(response_json, indent=2)}")
        except json.JSONDecodeError:
            print(f"Raw Response: {response.text[:500]}")
        
        if response.status_code != 200:
            print(f"❌ Tools list request failed with status {response.status_code}")
            return
        
        tools_data = response.json()
        
        if "error" in tools_data:
            print(f"❌ Server returned error: {tools_data['error']}")
            return
        
        tools = tools_data.get("result", {}).get("tools", [])
        print(f"✅ Found {len(tools)} tools")
        
        if tools:
            print("\nTools:")
            for tool in tools:
                print(f"  - {tool.get('name', 'Unknown')}")
        
        print("\n" + "=" * 60)
        print("✅ MCP Server Test Successful!")
        print("=" * 60)
        
    except requests.exceptions.ConnectionError:
        print(f"❌ Could not connect to MCP server at {base_url}")
        print("   Is the MCP server running?")
    except requests.exceptions.Timeout:
        print(f"❌ Connection to MCP server timed out")
    except Exception as e:
        print(f"❌ Error: {str(e)}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    test_mcp_initialization()
