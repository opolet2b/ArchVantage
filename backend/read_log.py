
# Script to safely analyze execution debug log
import os
import re

LOG_FILE = "execution_debug.log"

if not os.path.exists(LOG_FILE):
    print(f"Log file {LOG_FILE} not found.")
    exit(1)

print(f"Analyzing {LOG_FILE}...")
found_tags = 0
source_text_len = 0
extractor_input_details = ""

with open(LOG_FILE, "r", encoding="utf-8", errors="replace") as f:
    for line in f:
        if "[EXTRACTOR DEBUG]" in line:
            found_tags += 1
            print(f"LOG: {line.strip()}")
            
            if "Initial source_text" in line:
                # Extract snippet
                match = re.search(r"params: '(.*)'", line)
                if match:
                    snippet = match.group(1)
                    print(f"-> Source Text Snippet: {snippet}")
                    if snippet and snippet != "None":
                        print("-> Source Text seems POPULATED.")
            

            if "extractor_input variable" in line:
                print(f"-> Extractor Input Line found.")
        


        # (Removed redundant NODE START check to avoid variable error)
        pass


    # Re-read for context extraction
    f.seek(0)
    lines = f.readlines()
    for i, line in enumerate(lines):

        if "NODE START:" in line:
            print(f"NODE START DETECTED: {line.strip()}")
        
        if "NODE START:" in line and "step_extractor" in line:
            print(f"\n[Extactor Node Start Found]")
            # Parse the params dict from the next few lines
            # It's usually printed as a string representation of a dict
            # We'll just print the raw lines
            for j in range(1, 10): 
                if i+j < len(lines):
                    l = lines[i+j].strip()
                    if "'params':" in l:
                        print(f"PARAMS: {l}")
                    if "'instruction':" in l:
                        print(f"INSTRUCTION: {l}")
                    if "'schema':" in l:
                        print(f"SCHEMA: {l[:200]}...") # Truncate schema
        
        if "Initial source_text" in line:
             match = re.search(r"params: '(.*)'", line)
             if match:
                 snippet = match.group(1)
                 print(f"SOURCE TEXT SNIPPET: {snippet[:300]}")
    
print("-" * 30)

print("-" * 30)

print("-" * 30)
