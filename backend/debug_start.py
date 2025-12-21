import sys
import os
import uvicorn

# Print debug info
print(f"--- DEBUG START ---")
print(f"Python Executable: {sys.executable}")
print(f"Current Working Directory: {os.getcwd()}")
print(f"PYTHONPATH: {os.environ.get('PYTHONPATH', 'Not Set')}")
# print(f"sys.path: {sys.path}") # Uncomment if really needed, can be spammy

# Add the current directory (backend) to sys.path to ensure local imports work
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

print("Checking imports...")
try:
    import langchain_ollama
    print(f"Success: langchain_ollama found at {langchain_ollama.__file__}")
except ImportError as e:
    print(f"CRITICAL ERROR: Could not import langchain_ollama: {e}")
    print("sys.path is:")
    for p in sys.path:
        print(f"  - {p}")
    sys.exit(1)

print("Starting Uvicorn programmatically...")
try:
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=False)
except Exception as e:
    print(f"Failed to start uvicorn: {e}")
