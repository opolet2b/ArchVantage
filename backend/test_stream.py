import httpx
import asyncio

async def test_stream():
    url = "http://127.0.0.1:8000/api/v1/workflows/instances/460f6a66-f655-444c-a514-3385626fb842/stream"
    
    # We will simulate a local connection without a token. 
    # Let's bypass token auth by testing the generator directly instead.
    
    from app.core.database import SessionLocal
    from app.services.workflow_service import workflow_service
    
    db = SessionLocal()
    print("Testing stream generation directly...")
    
    gen = workflow_service.stream_workflow_execution("460f6a66-f655-444c-a514-3385626fb842", request=None)
    
    try:
        # Get first event
        event1 = await gen.__anext__()
        print(f"Event 1: {event1}")
        
        # Get second event
        event2 = await gen.__anext__()
        print(f"Event 2: {event2}")
        
    except StopAsyncIteration:
        print("Stream finished.")
    except Exception as e:
        print(f"Exception during stream: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(test_stream())
