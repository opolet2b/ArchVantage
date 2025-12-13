import sys
import traceback

try:
    from main import app
    print("Import successful")
except Exception as e:
    with open("import_error.log", "w") as f:
        traceback.print_exc(file=f)
