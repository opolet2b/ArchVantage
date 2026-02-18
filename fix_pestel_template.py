
import sys
import os

# 1. Setup Backend Path
# We need to add the backend directory to sys.path so we can import 'app' modules
backend_path = os.path.abspath("backend")
if backend_path not in sys.path:
    sys.path.append(backend_path)

print(f"DEBUG: Added {backend_path} to sys.path")

# 2. Configure Database URL - BEFORE importing app.core.database
# This is critical because app.core.database initializes the engine at module level
db_file_path = os.path.join(backend_path, "db", "sql_app.db")
# Convert backslashes to forward slashes for SQLAlchemy compatibility on Windows
db_file_path = db_file_path.replace("\\", "/")
# Use 4 slashes for absolute path on Windows/UNIX standard for SQLite: sqlite:////absolute/path/to/db
database_url = f"sqlite:///{db_file_path}"

print(f"DEBUG: Setting DATABASE_URL to: {database_url}")
os.environ["DATABASE_URL"] = database_url

try:
    from app.core.database import SessionLocal
    from app.models.smart_template import SmartAnalysisTemplate
    print("DEBUG: Successfully imported database modules")
except ImportError as e:
    print(f"DEBUG: Import Error: {e}")
    sys.exit(1)
except Exception as e:
    print(f"DEBUG: Initialization Error: {e}")
    sys.exit(1)

def fix_pestel():
    db = SessionLocal()
    try:
        print("DEBUG: Database session created. Searching for templates...")
        
        # 1. Find the PESTEL template
        try:
            templates = db.query(SmartAnalysisTemplate).all()
        except Exception as e:
            print(f"ERROR: Failed to query templates: {e}")
            return

        target_template = None
        for t in templates:
            if "PESTEL" in t.name or "PESTEL" in (t.description or ""):
                target_template = t
                break
        
        if not target_template:
            print("No PESTEL template found in 'smart_analysis_templates'.")
            print("Available Templates:")
            for t in templates:
                print(f"- {t.id}: {t.name}")
            return

        print(f"Found Template: {target_template.name} ({target_template.id})")
        
        # 2. Inspect pipeline_config
        config = target_template.pipeline_config
        
        # 3. Locate the "step_agent" node which has the prompt
        steps = config.get("steps", [])
        agent_step = next((s for s in steps if s.get("id") == "step_agent"), None)
        
        if not agent_step:
            print("ERROR: Could not find 'step_agent' in pipeline config.")
            return
            
        params = agent_step.get("params", {})
        instruction = params.get("instruction", "")
        
        # 4. Apply The Fix
        if "Clarify the Subject" in instruction:
            print("\n[FIX] Found problematic 'Clarify the Subject' instruction.")
            
            new_instruction = instruction.replace(
                "1. **Clarify the Subject** – If the user does not specify the exact sector, geography, or timeframe, ask for those details before proceeding.",
                "1. **Clarify the Subject** – Use the provided context to identify the sector, geography, or timeframe. If not explicitly stated, INFER the most logical context from the source documents and proceed with the analysis. DO NOT ask for clarification."
            )
            
            # Update the in-memory dict
            agent_step["params"]["instruction"] = new_instruction
            
            # Force update in DB
            from sqlalchemy.orm.attributes import flag_modified
            target_template.pipeline_config = config # Reassign to trigger detection (sometimes needed)
            flag_modified(target_template, "pipeline_config")
            
            db.commit()
            print("\n[SUCCESS] Template instruction updated in database.")
            
        else:
            print("\n[WARNING] 'Clarify the Subject' not found in instruction. Already fixed?")
            
    finally:
        db.close()

if __name__ == "__main__":
    fix_pestel()
