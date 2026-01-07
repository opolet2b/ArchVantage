
import json
import os
import sys

# Ensure backend is in path
sys.path.append(os.getcwd())

from app.core.database import SessionLocal
from app.models.smart_template import SmartAnalysisTemplate

TEMPLATE_ID = "9e2d39b8-5976-4977-bde4-b89df7b22033"

def inspect_template():
    db = SessionLocal()
    try:
        print(f"--- Inspecting Template ID: {TEMPLATE_ID} ---")
        template = db.query(SmartAnalysisTemplate).filter(SmartAnalysisTemplate.id == TEMPLATE_ID).first()
        
        if template:
            print(f"Found Template ID: {template.id}")
            with open("swot_debug.json", "w", encoding="utf-8") as f:
                json.dump(template.pipeline_config, f, indent=2)
            print("Dumped config to swot_debug.json")
        else:
            print("Template not found by ID. Searching by name 'SWOT'...")
            template = db.query(SmartAnalysisTemplate).filter(SmartAnalysisTemplate.name == "SWOT").first()
            if template:
                print(f"Found 'SWOT' Template ID: {template.id}")
                with open("swot_debug.json", "w", encoding="utf-8") as f:
                    json.dump(template.pipeline_config, f, indent=2)
                print("Dumped config to swot_debug.json")
            else:
                print("Template 'SWOT' not found.")
                
    finally:
        db.close()

if __name__ == "__main__":
    inspect_template()
