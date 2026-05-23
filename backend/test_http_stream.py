import httpx
import asyncio

async def test_http_stream():
    url = "http://127.0.0.1:8000/api/v1/workflows/instances/460f6a66-f655-444c-a514-3385626fb842/stream"
    
    # We need a token to connect via HTTP
    from app.core.database import SessionLocal
    from app.models.user import User
    from app.core.security import create_access_token
    from datetime import timedelta
    
    db = SessionLocal()
    user = db.query(User).filter(User.email == "admin@example.com").first()
    token = create_access_token(data={"sub": user.email}, expires_delta=timedelta(days=1))
    
    print("Connecting to SSE via HTTP...")
    try:
        async with httpx.AsyncClient() as client:
            async with client.stream("GET", f"{url}?token={token}", timeout=10.0) as response:
                print(f"Status: {response.status_code}")
                async for line in response.aiter_lines():
                    if line:
                        print(f"Received: {line}")
    except Exception as e:
        print(f"Exception: {e}")

if __name__ == "__main__":
    asyncio.run(test_http_stream())
