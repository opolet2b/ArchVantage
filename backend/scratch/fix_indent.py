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

    # Detect end of initialize (next method or end of class)
    if in_initialize and (line.startswith("    def ") or line.startswith("rag_service =")):
        in_initialize = False
        in_lock = False
        in_try = False
        new_lines.append(line)
        continue

    if in_lock:
        # We want to indent everything between 'with self._lock:' and the end of initialize
        # EXCEPT if it's already correctly indented.
        # Line 51 (the new 'try:') is at 12 spaces.
        # Lines from 52 onwards should be at 16 spaces (inside try) or 12 spaces (inside lock).
        
        # This is getting complicated. Let's just manually fix the block I touched.
        pass

# Actually, let's just use replace_file_content with a large enough chunk.
