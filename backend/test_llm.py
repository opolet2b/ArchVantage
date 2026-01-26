import asyncio
import sys
import os

# Add current directory to path so we can import app modules
sys.path.append(os.getcwd())

from app.services.llm_service import llm_service
from app.models.chat import Message

async def test_llm():
    print("Testing LLM Service...")
    try:
        response = await llm_service.chat(
            messages=[Message(role="user", content="Hello, are you working?")],
            model_name="default"
        )
        print(f"LLM Response: {response}")
    except Exception as e:
        print(f"LLM Error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(test_llm())
