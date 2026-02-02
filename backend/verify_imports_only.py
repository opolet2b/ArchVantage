
import asyncio
import sys
import os

# Add backend to path
sys.path.append(os.getcwd())

async def test():
    try:
        print("Importing smart_template_service...")
        from app.services.smart_template_service import smart_template_service
        print("smart_template_service imported.")
        
        print("Importing document_template_service via smart_template_service dependency check...")
        # Verify the module is accessible within the imported service's namespace (implicitly)
        # or just try to import it directly to ensure it loads
        from app.services.document_template_service import document_template_service
        print("document_template_service imported successfully.")
        
    except Exception as e:
        print("\nCRITICAL FAILURE:")
        print(f"{type(e).__name__}: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    if os.name == 'nt':
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
        
    asyncio.run(test())
