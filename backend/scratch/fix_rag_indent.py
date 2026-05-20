import sys

path = r"c:\Users\opole\Downloads\ChatBotn\backend\app\services\rag_service.py"

with open(path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

new_lines = []
in_initialize = False
in_lock = False
in_try = False

for i, line in enumerate(lines):
    # Detect start of initialize
    if "def initialize(self, model_name:" in line:
        in_initialize = True
        new_lines.append(line)
        continue
    
    # Detect start of lock
    if in_initialize and "with self._lock:" in line:
        in_lock = True
        new_lines.append(line)
        continue

    # Detect end of initialize
    if in_initialize and line.startswith("    def _get_postprocessors"):
        in_initialize = False
        in_lock = False
        in_try = False
        new_lines.append(line)
        continue

    if in_lock:
        # If it's the 'try:' line (line 51 in previous view)
        if "try:" in line and line.strip() == "try:":
            in_try = True
            new_lines.append(line) # Keep it as is (should be 12 spaces)
            continue
        
        # If it's the 'except Exception as e:' line (line 334 in previous view)
        if "except Exception as e:" in line and line.strip() == "except Exception as e:":
            in_try = False
            # Fix indentation of except to match try (12 spaces)
            new_lines.append("            except Exception as e:\n")
            continue

        # If we are inside the 'try' block, indent by 4 more spaces IF it's not already indented
        if in_try:
            # Lines inside the try block should be at 16 spaces.
            # Most are currently at 12 spaces.
            current_indent = len(line) - len(line.lstrip())
            if current_indent == 12:
                new_lines.append("    " + line)
            else:
                new_lines.append(line)
        else:
            # Outside try but inside lock (like the catch block content)
            # Catch block content should be at 16 spaces.
            # Currently it's at 12 spaces.
            current_indent = len(line) - len(line.lstrip())
            if current_indent == 12:
                new_lines.append("    " + line)
            else:
                new_lines.append(line)
    else:
        new_lines.append(line)

with open(path, 'w', encoding='utf-8') as f:
    f.writelines(new_lines)

print("Indentation fixed.")
