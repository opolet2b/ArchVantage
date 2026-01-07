from app.core.database import SessionLocal
from app.models.smart_template import SmartAnalysisTemplate
import json

def inspect_swot():
    db = SessionLocal()
    try:
        # Find SWOT template - try exact match or case insensitive
        templates = db.query(SmartAnalysisTemplate).all()
        swot_template = None
        for t in templates:
            if "swot" in t.name.lower():
                swot_template = t
                break
        
        if not swot_template:
            print("SWOT template not found!")
            return

        print(f"Found Template: {swot_template.name} (ID: {swot_template.id})")
        with open("swot_debug.json", "w", encoding="utf-8") as f:
            json.dump(swot_template.pipeline_config, f, indent=2)
        print("Wrote config to swot_debug.json")
        
    finally:
        db.close()

if __name__ == "__main__":
    inspect_swot()
