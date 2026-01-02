import sys
import os
import json
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# Add root to sys.path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.core.config import settings
from app.core.database import get_db, SessionLocal
from app.models.smart_template import SmartAnalysisTemplate




def debug_templates():
    # Force the correct DB path for debugging
    db_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "db", "sql_app.db")
    settings.DATABASE_URL = f"sqlite:///{db_path}"
    print(f"Connecting to DB at: {settings.DATABASE_URL}")
    
    # Re-create engine/session since we changed the settings
    from sqlalchemy import create_engine
    engine = create_engine(settings.DATABASE_URL, connect_args={"check_same_thread": False})
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

    db = SessionLocal()
    try:
        templates = db.query(SmartAnalysisTemplate).all()
        print(f"Found {len(templates)} templates.")
        
        for t in templates:
            # Filter for comparison or summary
            if "comparison" not in t.name.lower() and "compare" not in t.name.lower():
                continue

            print(f"\n[{t.id}] {t.name} ({t.category_name})")
            config = t.pipeline_config
            if not config:
                print("  No pipeline config.")
                continue
                
            nodes = config.get("nodes", [])
            steps = config.get("steps", [])
            
            all_steps = nodes + steps
            
            for step in all_steps:
                step_id = step.get("id")
                step_type = step.get("type", "").upper()
                params = step.get("params", {})
                
                print(f"  - Node {step_id}: {step_type}")
                print(f"  - Node {step_id}: {step_type}")
                print(f"    Params: {json.dumps(params, indent=2)}")
            
            # print(f"  Raw Config: {json.dumps(config, indent=2)}")

    finally:
        db.close()

if __name__ == "__main__":
    debug_templates()
