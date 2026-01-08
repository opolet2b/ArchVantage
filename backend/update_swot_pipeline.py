import json
import os
import sys

# Ensure backend is in path
sys.path.append(os.getcwd())

from app.core.database import SessionLocal
from app.models.smart_template import SmartAnalysisTemplate

TEMPLATE_ID = "9e2d39b8-5976-4977-bde4-b89df7b22033"

def update_pipeline():
    # 1. Read the debug file (source of truth for current state)
    with open("swot_debug.json", "r", encoding="utf-8") as f:
        config = json.load(f)
    
    print(f"Original Nodes: {len(config.get('nodes', []))}")
    print(f"Original Edges: {len(config.get('edges', []))}")
    
    # 2. Filter out step_formatter
    new_nodes = [n for n in config.get("nodes", []) if n["id"] != "step_formatter"]
    new_steps = [s for s in config.get("steps", []) if s["id"] != "step_formatter"]
    
    # 3. Filter out edges connecting to/from step_formatter
    new_edges = [e for e in config.get("edges", []) if e["target"] != "step_formatter" and e["source"] != "step_formatter"]
    
    config["nodes"] = new_nodes
    config["steps"] = new_steps
    config["edges"] = new_edges
    
    print(f"New Nodes: {len(config['nodes'])}")
    print(f"New Edges: {len(config['edges'])}")
    
    # 4. Update Database
    db = SessionLocal()
    try:
        template = db.query(SmartAnalysisTemplate).filter(SmartAnalysisTemplate.id == TEMPLATE_ID).first()
        if not template:
            print("Template not found inside update script! Searching by name.")
            template = db.query(SmartAnalysisTemplate).filter(SmartAnalysisTemplate.name == "SWOT").first()
            
        if template:
            print(f"Updating Template: {template.name} ({template.id})")
            # SQLAlchemy tracks changes to JSON fields, but sometimes needs flag_modified
            # Just reassigning strictly is usually safer
            template.pipeline_config = config
            db.add(template)
            db.commit()
            print("Database updated successfully.")
        else:
            print("Could not find template to update.")
            
    except Exception as e:
        db.rollback()
        print(f"Error updating database: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    update_pipeline()
