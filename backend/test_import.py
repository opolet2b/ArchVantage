
import sys
import os

# Add backend to path
sys.path.append(os.getcwd())

try:
    print("Attempting to import llm_service...")
    from app.services.llm_service import llm_service
    print("llm_service imported successfully.")
except Exception as e:
    print(f"Failed to import llm_service: {e}")
    import traceback
    traceback.print_exc()

try:
    print("Attempting to import smart_template_service...")
    from app.services.smart_template_service import smart_template_service
    print("smart_template_service imported successfully.")
except Exception as e:
    print(f"Failed to import smart_template_service: {e}")
    import traceback
    traceback.print_exc()
