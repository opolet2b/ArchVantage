"""
Simple MCP Server for testing the MCP client implementation.
This server follows the MCP specification for the initialization lifecycle.
"""
from flask import Flask, request, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app)  # Enable CORS for all routes

# Track initialization state
initialized = False

@app.route('/', methods=['POST'])
def handle_jsonrpc():
    """Handle JSON-RPC requests according to MCP specification"""
    global initialized
    
    data = request.get_json()
    
    # Validate JSON-RPC request
    if not data or 'jsonrpc' not in data or data['jsonrpc'] != '2.0':
        return jsonify({
            "jsonrpc": "2.0",
            "error": {
                "code": -32600,
                "message": "Invalid Request"
            }
        }), 400
    
    method = data.get('method')
    request_id = data.get('id')
    
    # Handle initialize method
    if method == 'initialize':
        response = {
            "jsonrpc": "2.0",
            "id": request_id,
            "result": {
                "protocolVersion": "2024-11-05",
                "capabilities": {
                    "logging": {},
                    "prompts": {
                        "listChanged": True
                    },
                    "resources": {
                        "subscribe": True,
                        "listChanged": True
                    },
                    "tools": {
                        "listChanged": True
                    }
                },
                "serverInfo": {
                    "name": "TestMCPServer",
                    "version": "1.0.0",
                    "description": "A test MCP server for development"
                },
                "instructions": "This is a test server that provides example tools"
            }
        }
        return jsonify(response), 200
    
    # Handle initialized notification
    elif method == 'notifications/initialized':
        initialized = True
        # Notifications don't return a response in JSON-RPC
        return '', 204
    
    # Handle tools/list method
    elif method == 'tools/list':
        if not initialized:
            return jsonify({
                "jsonrpc": "2.0",
                "id": request_id,
                "error": {
                    "code": -32002,
                    "message": "Server not initialized. Call initialize first."
                }
            }), 400
        
        response = {
            "jsonrpc": "2.0",
            "id": request_id,
            "result": {
                "tools": [
                    {
                        "name": "test_tool_1",
                        "description": "A test tool for demonstration",
                        "inputSchema": {
                            "type": "object",
                            "properties": {
                                "message": {
                                    "type": "string",
                                    "description": "A message to process"
                                }
                            },
                            "required": ["message"]
                        }
                    },
                    {
                        "name": "test_tool_2",
                        "description": "Another test tool",
                        "inputSchema": {
                            "type": "object",
                            "properties": {
                                "query": {
                                    "type": "string",
                                    "description": "Query to execute"
                                }
                            },
                            "required": ["query"]
                        }
                    }
                ]
            }
        }
        return jsonify(response), 200
    
    # Unknown method
    else:
        return jsonify({
            "jsonrpc": "2.0",
            "id": request_id,
            "error": {
                "code": -32601,
                "message": f"Method not found: {method}"
            }
        }), 404

if __name__ == '__main__':
    print("=" * 60)
    print("Starting Test MCP Server on http://localhost:3004")
    print("This server follows the MCP specification")
    print("=" * 60)
    app.run(host='0.0.0.0', port=3004, debug=True)
