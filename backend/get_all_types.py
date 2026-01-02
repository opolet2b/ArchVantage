import sys
import os
import json
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from app.core.config import settings
from app.models.smart_template import SmartAnalysisTemplate

def list_types():
    db_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "db", "sql_app.db")
    settings.DATABASE_URL = f"sqlite:///{db_path}"
    
    from sqlalchemy import create_engine
    engine = create_engine(settings.DATABASE_URL, connect_args={"check_same_thread": False})
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    db = SessionLocal()
    
    types = set()
    try:
        templates = db.query(SmartAnalysisTemplate).all()
        for t in templates:
            config = t.pipeline_config or {}
            steps = config.get("steps", [])
            nodes = config.get("nodes", [])
            all_steps = steps + nodes
            
            for stepped in all_steps:
                types.add(stepped.get("type"))
        
        print("Found Types:", types)
            
    finally:
        db.close()

if __name__ == "__main__":
    list_types()
