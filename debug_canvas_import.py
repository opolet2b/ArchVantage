import sys
import os
import traceback

# Add backend to path so we can import app modules
cwd = os.getcwd()
backend_path = os.path.join(cwd, "backend")
sys.path.append(backend_path)

print(f"Testing import of app.routers.canvas...")
print(f"PYTHONPATH includes: {backend_path}")

try:
    from app.routers import canvas
    print("SUCCESS: app.routers.canvas imported successfully.")
except Exception as e:
    print(f"FAILURE: Could not import app.routers.canvas.")
    print(f"Error: {e}")
    traceback.print_exc()
