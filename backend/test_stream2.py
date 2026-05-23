import httpx
import asyncio

async def test_stream():
    url = "http://127.0.0.1:8000/api/v1/workflows/instances/460f6a66-f655-444c-a514-3385626fb842/stream"
    
    from app.core.database import SessionLocal
    from app.services.workflow_service import workflow_service
    
    db = SessionLocal()
    print("Testing stream generation fully...")
    
    gen = workflow_service.stream_workflow_execution("460f6a66-f655-444c-a514-3385626fb842", request=None)
    
    try:
        while True:
            event = await gen.__anext__()
            print(f"Yielded: {event}")
            if "status" in event and "gui_schema" in event:
                break
    except StopAsyncIteration:
        print("Stream finished naturally.")
    except Exception as e:
        print(f"Exception during stream: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(test_stream())
