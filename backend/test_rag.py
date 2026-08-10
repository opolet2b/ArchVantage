import asyncio
from app.database import SessionLocal
from app.services.rag_service import rag_service

async def main():
    try:
        results = rag_service.search(
            query="test",
            filters={"canvas_id": "3a710df9-239d-45ba-9ab4-5b9f2c22ab96"},
            k=5,
            model_name="ollama/llama3" # Example
        )
        print("Success!", len(results))
    except Exception as e:
        import traceback
        traceback.print_exc()

asyncio.run(main())
