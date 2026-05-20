import os

path = r"c:\Users\opole\Downloads\ChatBotn\backend\app\services\rag_service.py"

with open(path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

new_lines = []
skip_until = -1

for i, line in enumerate(lines):
    if i < skip_until:
        continue
        
    # Start of initialize
    if "def initialize(self, model_name:" in line:
        new_lines.append(line)
        # Add next few lines manually to be sure
        new_lines.append(lines[i+1]) # docstring
        new_lines.append(lines[i+2])
        new_lines.append(lines[i+3])
        new_lines.append(lines[i+4])
        new_lines.append("        # If already initialized and no specific model update requested, skip.\n")
        new_lines.append("        if self._initialized and not model_name:\n")
        new_lines.append("            return\n")
        new_lines.append("\n")
        new_lines.append("        with self._lock:\n")
        new_lines.append("            # Re-check inside lock\n")
        new_lines.append("            if self._initialized and not model_name:\n")
        new_lines.append("                return\n")
        new_lines.append("\n")
        new_lines.append("            debug_service.log(\"INFO\", \"Knowledge Base\", \"RAG\", \"Initializing RAG Service (loading library)...\")\n")
        new_lines.append("            self.init_error = None\n")
        new_lines.append("            \n")
        new_lines.append("            try:\n")
        
        # Now we need to find where the original 'except Exception as e:' was and what's after it.
        # It was originally around line 317 in the first view.
        # But after my mess it's somewhere else.
        
        # Let's find the end of initialize.
        end_idx = i
        for j in range(i+1, len(lines)):
            if lines[j].startswith("    def _get_postprocessors"):
                end_idx = j
                break
        
        # Extract the content of the old try block, fix its indentation, and add it.
        # We need to skip the mess I made at the beginning of the block.
        # The first meaningful line after 'try:' should be 'from app.services.config_service import config_service'
        
        start_of_content = -1
        for j in range(i, end_idx):
            if "from app.services.config_service import config_service" in lines[j]:
                start_of_content = j
                break
        
        # Find where 'except Exception as e:' is
        except_idx = -1
        for j in range(start_of_content, end_idx):
            if "except Exception as e:" in lines[j] and lines[j].strip() == "except Exception as e:":
                except_idx = j
                break
        
        if start_of_content != -1 and except_idx != -1:
            # Indent content of try
            for j in range(start_of_content, except_idx):
                content_line = lines[j].strip()
                if not content_line:
                    new_lines.append("\n")
                else:
                    new_lines.append("                " + content_line + "\n")
            
            new_lines.append("            except Exception as e:\n")
            
            # Indent content of except
            for j in range(except_idx + 1, end_idx):
                content_line = lines[j].strip()
                if not content_line:
                    new_lines.append("\n")
                else:
                    new_lines.append("                " + content_line + "\n")
        
        skip_until = end_idx
        continue
    
    new_lines.append(line)

with open(path, 'w', encoding='utf-8') as f:
    f.writelines(new_lines)
print("Initialization logic fixed and indented.")
