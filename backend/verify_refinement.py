
import asyncio
import sys
import os

# Add backend to path
sys.path.append(os.getcwd())

async def test():
    try:
        print("Importing service...")
        from app.services.smart_template_service import smart_template_service
        print("Service imported.")
        
        print("Checking DB connection/Mapping...")
        # This triggers the ORM mapping check
        from app.models.canvas_models import CanvasThing, Domain, ThingType
        print("Models imported.")
        
        # Mock section
        section = {
            "title": "Test Section",
            "content": "This is a test content that needs refinement.",
            "score": 50,
            "feedback": "Make it better.",
            "issues": ["Too short"]
        }
        
        print("Calling _refine_section (LLM Test)...")
        result = await smart_template_service._refine_section(section, "Testing purpose", "gpt-3.5-turbo")
        print("Result:", result)
        
    except Exception as e:
        print("\nCRITICAL FAILURE:")
        print(f"{type(e).__name__}: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    if os.name == 'nt':
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
        
    asyncio.run(test())
