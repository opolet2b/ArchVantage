import sqlite3
import json

conn = sqlite3.connect('backend/app/semantic_canvas.db')
cursor = conn.cursor()

# Get all tables
cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
tables = cursor.fetchall()

print("Available tables:")
for table in tables:
    print(f"  - {table[0]}")

# Check templates table
cursor.execute("""
    SELECT id, name, pipeline_config 
    FROM templates 
    WHERE name LIKE '%Smart%' OR name LIKE '%Analy%'
""")

rows = cursor.fetchall()

for r in rows:
    print(f"\n{'='*80}")
    print(f"ID: {r[0]}")
    print(f"Name: {r[1]}")
    print(f"\nPipeline Config:")
    if r[2]:
        config = json.loads(r[2])
        
        # Check for enableCitations in agent steps
        steps = config.get('steps', [])
        for step in steps:
            if 'agent' in step.get('type', '').lower():
                step_config = step.get('config', {})
                enable_citations = step_config.get('enableCitations', False)
                print(f"\n  Agent Step: {step.get('name')}")
                print(f"  enableCitations: {enable_citations}")
        
        print(f"\nFull Config:")
        print(json.dumps(config, indent=2))
    else:
        print("  (No config)")

conn.close()
