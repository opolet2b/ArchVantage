import json
import os
import sys

# Ensure backend is in path
sys.path.append(os.getcwd())

from app.core.database import SessionLocal
from app.models.smart_template import SmartAnalysisTemplate

TEMPLATE_ID = "9e2d39b8-5976-4977-bde4-b89df7b22033"

def restore_pipeline():
    # 1. Read the debug file (source of truth for ORIGINAL state)
    try:
        with open("swot_debug.json", "r", encoding="utf-8") as f:
            config = json.load(f)
        
        print(f"Reading configuration from swot_debug.json")
        print(f"Nodes in backup: {len(config.get('nodes', []))}")
        print(f"Edges in backup: {len(config.get('edges', []))}")
        
    except Exception as e:
        print(f"Error reading backup file: {e}")
        return

    # 4. Update Database
    db = SessionLocal()
    try:
        template = db.query(SmartAnalysisTemplate).filter(SmartAnalysisTemplate.id == TEMPLATE_ID).first()
        if not template:
            print("Template not found inside restore script! Searching by name.")
            template = db.query(SmartAnalysisTemplate).filter(SmartAnalysisTemplate.name == "SWOT").first()
            
        if template:
            print(f"Restoring Template: {template.name} ({template.id})")
            template.pipeline_config = config
            db.add(template)
            db.commit()
            print("Database restored successfully.")
        else:
            print("Could not find template to update.")
            
    except Exception as e:
        db.rollback()
        print(f"Error updating database: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    restore_pipeline()
