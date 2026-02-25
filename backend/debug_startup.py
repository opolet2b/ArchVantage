import sys
import traceback

try:
    import main
    print("Import successful!")
except Exception as e:
    traceback.print_exc()
