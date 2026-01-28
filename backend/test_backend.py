
import asyncio
import sys
import os

# Add parent directory to sys.path for imports
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

async def test():
    try:
        print("Testing imports...")
        from app.services.llm_service import LLMService
        from app.services.agent_runtime import AgentRuntime
        print("Imports successful.")
        
        print("Testing LLMService initialization...")
        llm = LLMService()
        print("LLMService initialized.")
        
        print("Testing AgentRuntime initialization...")
        runtime = AgentRuntime({})
        print("AgentRuntime initialized.")
        
        print("All backend checks passed!")
    except Exception as e:
        print(f"Backend test failed: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(test())
