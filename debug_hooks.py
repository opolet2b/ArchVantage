
import re

file_path = "frontend/src/components/semantic-canvas/canvas-view.tsx"

with open(file_path, "r", encoding="utf-8") as f:
    lines = f.readlines()

print(f"Scanning {file_path} for top-level returns in CanvasViewInner...")

inside_component = False
brace_depth = 0
component_start_indent = 0

for i, line in enumerate(lines):
    stripped = line.strip()
    
    if "function CanvasViewInner()" in line:
        inside_component = True
        component_start_indent = len(line) - len(line.lstrip())
        print(f"Found CanvasViewInner at line {i+1}")
        continue

    if not inside_component:
        continue

    # Count braces to know if we are at top level
    # This is a naive heuristic but works for well-formatted code
    brace_depth += line.count("{")
    brace_depth -= line.count("}")
    
    if brace_depth < 0:
        # Exited component
        inside_component = False
        print(f"Exited CanvasViewInner at line {i+1}")
        break

    # Check for return
    if "return" in line:
        # Check indentation
        indent = len(line) - len(line.lstrip())
        
        # Filter out comments
        if "//" in line and line.index("//") < line.index("return"):
            continue
            
        # Only interested in returns that might be top-level or slightly nested
        # Component body is indent 4.
        # Top level IF is indent 4, body is indent 8.
        # So return inside IF is indent 8.
        # return independent is indent 4.
        
        if indent <= 8:
             print(f"Line {i+1}: Indent {indent} | Braces {brace_depth} | {stripped}")

