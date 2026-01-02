import sys
import os
import json
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from app.core.config import settings
from app.models.smart_template import SmartAnalysisTemplate

def debug_vizualiser():
    db_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "db", "sql_app.db")
    settings.DATABASE_URL = f"sqlite:///{db_path}"
    
    from sqlalchemy import create_engine
    engine = create_engine(settings.DATABASE_URL, connect_args={"check_same_thread": False})
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    db = SessionLocal()
    
    try:
        templates = db.query(SmartAnalysisTemplate).all()
        found = False
        for t in templates:
            config = t.pipeline_config or {}
            steps = config.get("steps", [])
            nodes = config.get("nodes", [])
            all_steps = steps + nodes
            
            for stepped in all_steps:
                if stepped.get("type", "").upper() == "VIZUALISER":
                    print(f"FOUND VIZUALISER in Template '{t.name}'")
                    print(f"Params: {json.dumps(stepped.get('params'), indent=2)}")
                    found = True
        
        if not found:
            print("No VIZUALISER nodes found.")
            
    finally:
        db.close()

if __name__ == "__main__":
    debug_vizualiser()
