from app.core.database import SessionLocal
from sqlalchemy import text
import json

db = SessionLocal()
result = db.execute(text("SELECT id, name, configuration FROM tools"))

print(f"Query executed.")

for row in result:
    tool_id, tool_name, config_json = row
    
    # Config is stored as JSON type in DB? Or string?
    # SQLAlchemy might return dict if JSON type, or string if Text.
    # In SQLite/Postgres it depends.
    if isinstance(config_json, str):
        try:
            config = json.loads(config_json)
        except:
             config = {}
    else:
        config = config_json or {}
        
    output_schema = config.get("output_schema")
    
    print(f"--- Tool: {tool_name} (ID: {tool_id}) ---")
    print(f"Type of config: {type(config_json)}")
    print(f"Content: {config_json}")
    if output_schema:
        print("Output Schema:")
        print(json.dumps(output_schema, indent=2))
    else:
        print("No output_schema")
    print("\n")
db.close()


