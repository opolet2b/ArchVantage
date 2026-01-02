import sqlite3
import json

db_path = "backend/db/sql_app.db"

def check_template_sqlite(name):
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    cursor.execute("SELECT id, name, pipeline_config FROM smart_analysis_templates WHERE name = ?", (name,))
    row = cursor.fetchone()
    
    if not row:
        print(f"Template '{name}' not found.")
        print("Available templates:")
        cursor.execute("SELECT name FROM smart_analysis_templates")
        for r in cursor.fetchall():
            print(f"- {r[0]}")
        return

    tid, tname, config_json = row
    print(f"Template: {tname} ({tid})")
    
    try:
        config = json.loads(config_json)
    except json.JSONDecodeError:
        print("Config is invalid JSON")
        return

    if "nodes" in config:
        print(f"Nodes count: {len(config['nodes'])}")
        found = False
        for node in config['nodes']:
            node_type = node.get('type')
            print(f" - ID: {node.get('id')}, Type: {node_type}, Label: {node.get('data', {}).get('label')}")
            
            if node_type and str(node_type).upper() == "START":
                found = True
                print(f"   -> MATCHES logic 'upper() == START'")
        
        if not found:
            print(" -> NO START NODE FOUND by logic")
    elif "steps" in config:
        print(f"Steps count: {len(config['steps'])}")
        for i, step in enumerate(config['steps']):
            print(f" - Step {i}: Type: {step.get('type')}, ID: {step.get('id')}, Params: {step.get('params')}")
    else:
        print(f"No 'nodes' dict key in config. Keys: {list(config.keys())}")

    conn.close()

if __name__ == "__main__":
    check_template_sqlite("Comparison")
