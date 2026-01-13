from app.core.database import SessionLocal
from sqlalchemy import text
import json

db = SessionLocal()

# Correct output schema for "Social Security List of Columns"
correct_schema = {
    "type": "array",
    "items": {
        "type": "object",
        "properties": {
            "name": {
                "type": "string",
                "description": "Column identifier"
            },
            "labels": {
                "type": "object",
                "description": "Localized labels"
            },
             "values": {
                "type": "object",
                "description": "Possible values map"
            }
        }
    }
}

# Update Tool 1
sql = text("UPDATE tools SET configuration = json_set(configuration, '$.output_schema', :schema) WHERE id = 1")

# Because SQLite/Postgres syntax for JSON updates varies, and SQLAlchemy abstraction might be tricky with raw SQL + JSON path.
# A Safer way is to Read-Modify-Write using Python JSON.

# Read
result = db.execute(text("SELECT configuration FROM tools WHERE id = 1")).fetchone()
if result and result[0]:
    config_json = result[0]
    if isinstance(config_json, str):
        config = json.loads(config_json)
    else:
        config = config_json
        
    config['output_schema'] = correct_schema
    
    # Write back
    new_config_str = json.dumps(config)
    # Using parameterized query for safety
    db.execute(text("UPDATE tools SET configuration = :config WHERE id = 1"), {"config": new_config_str})
    db.commit()
    print("Successfully updated Tool 1 Output Schema.")
else:
    print("Tool 1 not found.")
