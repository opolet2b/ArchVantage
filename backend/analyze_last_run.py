
import json
import os

LOG_FILE = "execution_debug.log"

def analyze():
    if not os.path.exists(LOG_FILE):
        print("Log file not found.")
        return

    print(f"Reading {LOG_FILE}...")
    
    last_extractor_output = None
    
    with open(LOG_FILE, "r", encoding="utf-8", errors="replace") as f:
        lines = f.readlines()
        
    # Iterate backwards to find the last extractor run
    for i in range(len(lines) - 1, -1, -1):
        line = lines[i]
        
        # Look for NODE END
        if "NODE END:" in line and ("extractor" in line or "step_1" in line): 
            # Note: Node IDs might not contain "extractor" explicitly if renamed, 
            # but usually they do or we track the ID from NODE START.
            # Let's search for the generic block and check context.
            pass

    # Easier approach: Collect all Node Starts and Ends, then find the last 'extractor' type node.
    
    events = []
    for i, line in enumerate(lines):
        if "NODE START:" in line:
            events.append({"type": "start", "line": i, "content": line.strip()})
        elif "NODE END:" in line:
            events.append({"type": "end", "line": i, "content": line.strip()})
            
    # Find last start that looks like an extractor
    last_extractor_idx = -1
    for idx, e in enumerate(events):
        if e["type"] == "start" and "step_extractor" in e["content"]:
            last_extractor_idx = idx
            
    if last_extractor_idx != -1:
        start_event = events[last_extractor_idx]
        print(f"Found Last Extractor Start: {start_event['content']}")
        
        # Find corresponding end
        # Assuming simple sequential log (which it is for this single-threaded debug log)
        if last_extractor_idx + 1 < len(events):
            end_event = events[last_extractor_idx + 1]
            if end_event["type"] == "end":
                print(f"Found End Event: {end_event['content']}")
                
                # Now print the lines BETWEEN the log header and the next separator
                # The log format in agent_runtime is:
                # _log_execution(title, data) -> writes title, then json-string of data
                
                # Let's read the lines after the END event line
                start_line = end_event["line"] + 1
                data_accum = ""
                for j in range(start_line, len(lines)):
                    l = lines[j]
                    if "===" in l: # End of block
                        break
                    data_accum += l
                
                print("\n--- EXTRACTOR OUTPUT DATA ---")
                print(data_accum[:2000]) # First 2000 chars
                print("-----------------------------")
            else:
                print("Next event was NOT an end event. Interleaved?")
        else:
            print("No End event found for this start.")
    else:
        print("No 'step_extractor' Node Start found in log.")

if __name__ == "__main__":
    analyze()
