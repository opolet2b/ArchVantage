import asyncio
import os
import sys

# Add backend directory to path
sys.path.append(os.path.join(os.path.dirname(__file__), "app"))
sys.path.append(os.path.dirname(__file__))

from app.services.llm_service import llm_service
from app.models.chat import Message

async def main():
    print("Testing connection to Qwen 3 VL Remote...")
    messages = [Message(role="user", content="Hello, tell me a 1-sentence joke.")]
    try:
        async for chunk in llm_service.astream_chat(messages, "Qwen 3 VL Remote"):
            print(f"CHUNK: {repr(chunk)}")
    except Exception as e:
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(main())
