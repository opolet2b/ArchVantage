import sys
import os
import json
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# Add backend to sys.path
sys.path.append(os.path.join(os.getcwd(), 'backend'))

from app.core.database import Base
from app.models.smart_template import SmartAnalysisTemplate

# Setup DB
SQLALCHEMY_DATABASE_URL = "sqlite:///./backend/sql_app.db"
engine = create_engine(SQLALCHEMY_DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def check_template(name):
    db = SessionLocal()
    try:
        template = db.query(SmartAnalysisTemplate).filter(SmartAnalysisTemplate.name == name).first()
        if not template:
            print(f"Template '{name}' not found.")
            # List all templates
            print("Available templates:")
            for t in db.query(SmartAnalysisTemplate).all():
                print(f"- {t.name}")
            return

        print(f"Template: {template.name} ({template.id})")
        print("Config Structure:")
        config = template.pipeline_config
        # It might be stored as string or dict depending on how it was saved/loaded
        if isinstance(config, str):
            try:
                config = json.loads(config)
            except:
                print("Config is raw string (invalid JSON)")
        
        # Check nodes
        if "nodes" in config:
            print(f"Nodes count: {len(config['nodes'])}")
            for node in config['nodes']:
                print(f" - ID: {node.get('id')}, Type: {node.get('type')}, Label: {node.get('data', {}).get('label')}")
        else:
             print("No 'nodes' key in config.")
             
        # Check if START node exists by my logic
        found = False
        for node in config.get('nodes', []):
            node_type = node.get('type')
            if node_type and str(node_type).upper() == "START":
                found = True
                print(f" -> FOUND START NODE: {node.get('id')}")
        
        if not found:
            print(" -> NO START NODE FOUND by logic 'type.upper() == START'")

    finally:
        db.close()

if __name__ == "__main__":
    check_template("Comparison")
