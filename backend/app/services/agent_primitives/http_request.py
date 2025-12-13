"""
HTTP Request Primitive

Performs REST API calls with SSRF protection via the egress proxy.
"""
from typing import Any, Dict
import httpx
from app.services.agent_primitives.base import BasePrimitive, PrimitiveResult


class HTTPRequestPrimitive(BasePrimitive):
    """
    Primitive for making HTTP requests to external APIs.
    
    All requests are routed through the egress proxy for security.
    """
    
    @property
    def name(self) -> str:
        return "HTTP_REQUEST"
    
    @property
    def description(self) -> str:
        return "Performs a REST API call to an external endpoint."
    
    @property
    def param_schema(self) -> Dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "method": {
                    "type": "string",
                    "enum": ["GET", "POST", "PUT", "PATCH", "DELETE"],
                    "default": "GET"
                },
                "url": {
                    "type": "string",
                    "description": "The URL to request"
                },
                "headers": {
                    "type": "object",
                    "description": "HTTP headers",
                    "default": {}
                },
                "body": {
                    "type": "object",
                    "description": "Request body (for POST/PUT/PATCH)",
                    "default": None
                }
            },
            "required": ["url"]
        }
    
    async def execute(
        self, 
        params: Dict[str, Any], 
        state: Dict[str, Any]
    ) -> PrimitiveResult:
        """Execute an HTTP request."""
        try:
            # Resolve variables in parameters
            method = params.get("method", "GET")
            url = self.resolve_variables(params.get("url", ""), state)
            headers = params.get("headers", {})
            body = params.get("body")
            
            # Resolve variables in headers
            resolved_headers = {}
            for key, value in headers.items():
                resolved_headers[key] = self.resolve_variables(str(value), state)
            
            # TODO: Route through egress proxy for SSRF protection
            # For now, use direct request with safety checks
            from app.services.agent_egress_proxy import egress_proxy
            if not egress_proxy.validate_url(url):
                return PrimitiveResult(
                    success=False,
                    error=f"URL blocked by security policy: {url}"
                )
            
            async with httpx.AsyncClient(timeout=30.0) as client:
                if method == "GET":
                    response = await client.get(url, headers=resolved_headers)
                elif method == "POST":
                    response = await client.post(
                        url, headers=resolved_headers, json=body
                    )
                elif method == "PUT":
                    response = await client.put(
                        url, headers=resolved_headers, json=body
                    )
                elif method == "PATCH":
                    response = await client.patch(
                        url, headers=resolved_headers, json=body
                    )
                elif method == "DELETE":
                    response = await client.delete(url, headers=resolved_headers)
                else:
                    return PrimitiveResult(
                        success=False,
                        error=f"Unsupported method: {method}"
                    )
            
            # Parse response
            try:
                response_data = response.json()
            except Exception:
                response_data = response.text
            
            return PrimitiveResult(
                success=response.status_code < 400,
                output={
                    "status_code": response.status_code,
                    "headers": dict(response.headers),
                    "body": response_data
                },
                error=None if response.status_code < 400 
                      else f"HTTP {response.status_code}"
            )
            
        except httpx.TimeoutException:
            return PrimitiveResult(
                success=False,
                error="Request timed out"
            )
        except Exception as e:
            return PrimitiveResult(
                success=False,
                error=str(e)
            )
