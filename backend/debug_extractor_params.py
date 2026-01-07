
# Minimal script to finding instruction and schema in log
import re

LOG_FILE = "execution_debug.log"

print(f"Scanning {LOG_FILE} for Instruction/Schema...")

with open(LOG_FILE, "r", encoding="utf-8", errors="replace") as f:
    text = f.read()
    
    # Try to find the params block of step_extractor
    # It usually appears after NODE START: step_extractor
    
    # We'll regex specific keys which are rare enough
    
    instr_match = re.search(r"'instruction':\s*'(.*?)'", text)
    if instr_match:
        print(f"FOUND INSTRUCTION: {instr_match.group(1)}")
    else:
        # Try double quotes
        instr_match_dq = re.search(r'"instruction":\s*"(.*?)"', text)
        if instr_match_dq:
             print(f"FOUND INSTRUCTION: {instr_match_dq.group(1)}")
        else:
             print("INSTRUCTION NOT FOUND via simple regex.")

    # Search for schema
    schema_match = re.search(r"'schema':\s*({.*?})", text)
    if schema_match:
        print(f"FOUND SCHEMA start: {schema_match.group(1)[:100]}...")
    else:
        print("SCHEMA NOT FOUND via simple regex.")
