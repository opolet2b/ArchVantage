import httpx
import asyncio
import traceback

async def test_http_stream():
    url = "http://127.0.0.1:8000/api/v1/workflows/instances/e9bf7646-fce5-4a19-bc44-a62a5410831f/stream"
    
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
        print(f"Exception: {type(e).__name__} - {str(e)}")
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(test_http_stream())
