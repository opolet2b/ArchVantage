import sys
import os
import json
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.orm.attributes import flag_modified

# Add root to sys.path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.core.config import settings
from app.models.smart_template import SmartAnalysisTemplate

def fix_templates():
    # Force the correct DB path for debugging/fixing
    db_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "db", "sql_app.db")
    settings.DATABASE_URL = f"sqlite:///{db_path}"
    print(f"Connecting to DB at: {settings.DATABASE_URL}")
    
    from sqlalchemy import create_engine
    engine = create_engine(settings.DATABASE_URL, connect_args={"check_same_thread": False})
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

    db = SessionLocal()
    try:
        templates = db.query(SmartAnalysisTemplate).all()
        count = 0
        for t in templates:
            print(f"Checking template: {t.name} ({t.id})")
            # Deep copy to ensure we aren't just modifying reference
            config = json.loads(json.dumps(t.pipeline_config)) if t.pipeline_config else {}
            
            if not config:
                continue
                
            nodes = config.get("nodes", [])
            steps = config.get("steps", [])
            all_steps = nodes + steps
            
            modified = False
            for step in all_steps:
                step_type = step.get("type", "").upper()
                if step_type == "EXTRACTOR":
                    params = step.get("params", {})
                    source_text = params.get("source_text")
                    print(f"  - Node {step.get('id')} source_text: {source_text}")
                    
                    if not source_text or source_text == "None":
                        print(f"    FIXING missing source_text...")
                        params["source_text"] = "{{ combined_context }}"
                        step["params"] = params
                        modified = True
            
            if modified:
                # Re-structure config
                if nodes: config["nodes"] = nodes
                if steps: config["steps"] = steps # though steps and nodes might reference same list in loop if carefully handled, here all_steps was concat.
                # Actually, nodes and steps are lists.
                # We need to write back to config correctly.
                # Re-assigning to config based on where the step came from is tricky if we iterated `all_steps`.
                
                # Better approach: Iterate locally and update inplace in config structure
                new_nodes = []
                for node in config.get("nodes", []):
                    if node.get("type", "").upper() == "EXTRACTOR":
                        if not node.get("params", {}).get("source_text"):
                             node["params"] = node.get("params", {})
                             node["params"]["source_text"] = "{{ combined_context }}"
                    new_nodes.append(node)
                config["nodes"] = new_nodes
                
                new_steps = []
                for step in config.get("steps", []):
                    if step.get("type", "").upper() == "EXTRACTOR":
                         if not step.get("params", {}).get("source_text"):
                             step["params"] = step.get("params", {})
                             step["params"]["source_text"] = "{{ combined_context }}"
                    new_steps.append(step)
                config["steps"] = new_steps

                t.pipeline_config = config
                flag_modified(t, "pipeline_config")
                db.add(t)
                count += 1
                print("    Marked for update.")
        
        if count > 0:
            db.commit()
            print(f"Successfully updated {count} templates.")
        else:
            print("No templates needed fixing.")
            
    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    fix_templates()
