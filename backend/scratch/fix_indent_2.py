import os

path = r"c:\Users\opole\Downloads\ChatBotn\backend\app\services\rag_service.py"

with open(path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

new_lines = []
in_initialize = False
method_start_idx = -1
method_end_idx = -1

for i, line in enumerate(lines):
    if "def initialize(self, model_name:" in line:
        method_start_idx = i
        in_initialize = True
    if in_initialize and line.startswith("    def _get_postprocessors"):
        method_end_idx = i
        in_initialize = False

# We need the ORIGINAL file content to fix it properly.
# But I already overwrote it.
# Wait, I can try to find the "base" indentation of each line in my mess and fix it.
# Actually, I'll just use the fact that I know what the structure SHOULD be.

# I'll use a hardcoded version of the initialize method since I have the parts.
# Or better, I'll use the 'TargetContent' approach with a very specific match.

# Let's try to fix the current file by detecting lines that should be indented more.
# Every line between 'try:' and 'except Exception as e:' in initialize should be indented at least 16 spaces.

in_lock = False
in_try = False
in_initialize = False

fixed_lines = []
for i, line in enumerate(lines):
    if "def initialize(self, model_name:" in line:
        in_initialize = True
        fixed_lines.append(line)
        continue
    if in_initialize and "with self._lock:" in line:
        in_lock = True
        fixed_lines.append(line)
        continue
    if in_initialize and line.startswith("    def _get_postprocessors"):
        in_initialize = False
        in_lock = False
        in_try = False
        fixed_lines.append(line)
        continue
    
    if in_lock:
        if "try:" in line and line.strip() == "try:":
            in_try = True
            fixed_lines.append("            try:\n")
            continue
        if "except Exception as e:" in line and line.strip() == "except Exception as e:":
            in_try = False
            fixed_lines.append("            except Exception as e:\n")
            continue
        
        # Strip leading spaces and re-indent based on context
        stripped = line.lstrip()
        if not stripped:
            fixed_lines.append("\n")
            continue
            
        # Basic heuristic: 
        # If it's if/elif/else/try/except/with, it starts a block.
        # But we don't know the nesting.
        
        # Actually, I'll just restore the indentation by looking at the logical structure.
        # This is hard.
        
        # Let's try another way. I have the view_file from before the mess!
        # Oh wait, I don't have the WHOLE file.
        pass

# I'll use the 'TargetContent' with a large chunk that I know the contents of.
