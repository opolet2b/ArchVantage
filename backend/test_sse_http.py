import httpx
import asyncio

async def test_sse():
    # Login to get token
    async with httpx.AsyncClient() as client:
        resp = await client.post("http://localhost:8000/api/v1/auth/login", data={"username": "admin@example.com", "password": "password"})
        if resp.status_code != 200:
            print("Login failed", resp.text)
            return
        token = resp.json()["access_token"]
        
        # Start workflow
        payload = {"template_id": "e7c9bb3d-80fa-4b6b-9ca7-a42fcd80801c", "canvas_id": "canvas_id", "initial_payload": {}}
        # Or just listen to the existing one
        url = f"http://localhost:8000/api/v1/workflows/instances/1c3d165e-a356-4809-a2cd-845ac281591f/stream?token={token}"
        async with client.stream("GET", url) as response:
            if response.status_code != 200:
                print("SSE failed:", response.status_code, response.text)
                return
            async for line in response.aiter_lines():
                if line:
                    print("SSE:", line)
                    break

asyncio.run(test_sse())
