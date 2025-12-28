
import os
import glob
import re
from datetime import datetime

BRAIN_DIR = r"C:\Users\opole\.gemini\antigravity\brain"
OUTPUT_FILE = r"C:\Users\opole\Downloads\ChatBotn\PROJECT_HISTORY.md"

def parse_implementation_plan(file_path):
    """Extracts Goal and Proposed Changes from implementation_plan.md"""
    if not os.path.exists(file_path):
        return None, None
        
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
            
        goal = "N/A"
        changes = "N/A"
        
        # Regex for Goal (fuzzy match)
        goal_match = re.search(r'#+\s*(?:Goal Description|User Objective|Problem Statement)([\s\S]*?)(?=\n#+|$)', content, re.IGNORECASE)
        if goal_match:
            goal = goal_match.group(1).strip()
            
        # Regex for Proposed Changes
        changes_match = re.search(r'#+\s*(?:Proposed Changes|Technical Plan)([\s\S]*?)(?=\n#+|$)', content, re.IGNORECASE)
        if changes_match:
            changes = changes_match.group(1).strip()
            
        return goal, changes
    except Exception as e:
        return f"Error reading file: {e}", f"Error reading file: {e}"

def parse_tasks(file_path):
    """Extracts tasks from task.md"""
    if not os.path.exists(file_path):
        return "N/A"
        
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
        return content.strip()
    except Exception as e:
        return f"Error reading file: {e}"

def main():
    print(f"Scanning {BRAIN_DIR}...")
    
    conversations = []
    
    # Iterate over all subdirectories in brain dir
    for root, dirs, files in os.walk(BRAIN_DIR):
        # We only care about immediate subdirectories of BRAIN_DIR
        if root != BRAIN_DIR:
            continue
            
        for d in dirs:
            conv_id = d
            conv_path = os.path.join(root, d)
            
            plan_path = os.path.join(conv_path, "implementation_plan.md")
            task_path = os.path.join(conv_path, "task.md")
            
            # Extract data
            goal, specs = parse_implementation_plan(plan_path)
            tasks = parse_tasks(task_path)
            
            # Simple timestamp approximation from folder metadata if possible, 
            # otherwise just append and we sort by name (UUIDs aren't time sorted but better than nothing)
            # Actually, standard file system modify time of the folder might be a decent proxy
            try:
                mtime = os.path.getmtime(conv_path)
            except:
                mtime = 0
                
            conversations.append({
                "id": conv_id,
                "timestamp": mtime,
                "goal": goal,
                "specs": specs,
                "tasks": tasks,
                "has_data": (goal != "N/A" or tasks != "N/A")
            })

    # Sort by timestamp descending (newest first)
    conversations.sort(key=lambda x: x['timestamp'], reverse=True)
    
    print(f"Found {len(conversations)} conversations.")
    
    # Generate Markdown
    md_output = f"# Project History Export\n\nGenerated on: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n\n"
    
    count = 0
    for conv in conversations:
        if not conv['has_data']:
            continue
            
        count += 1
        md_output += f"## {count}. Conversation `{conv['id']}`\n"
        md_output += f"**Date (approx):** {datetime.fromtimestamp(conv['timestamp']).strftime('%Y-%m-%d %H:%M')}\n\n"
        
        md_output += "### 1. Requirements / Goals\n"
        if conv['goal'] and conv['goal'] != "N/A":
            md_output += f"{conv['goal']}\n\n"
        else:
            md_output += "_No implementation plan found._\n\n"
            
        md_output += "### 2. Technical Specifications\n"
        if conv['specs'] and conv['specs'] != "N/A":
            # Indent code blocks inside specs? No, raw markdown is fine.
            md_output += f"{conv['specs']}\n\n"
        else:
            md_output += "_No specifications found._\n\n"
            
        md_output += "### 3. Tasks & Status\n"
        if conv['tasks'] and conv['tasks'] != "N/A":
            md_output += f"```markdown\n{conv['tasks']}\n```\n\n"
        else:
            md_output += "_No task list found._\n\n"
            
        md_output += "---\n\n"
        
    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        f.write(md_output)
        
    print(f"Successfully wrote history to {OUTPUT_FILE}")

if __name__ == "__main__":
    main()
