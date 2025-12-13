#!/usr/bin/env python
"""Debug tool data to check tool_type values."""
import sqlite3
import json

conn = sqlite3.connect('data/sql_app.db')
cursor = conn.cursor()

# Get tools used by Capital agent
cursor.execute("SELECT id, name, tool_type, configuration FROM tools WHERE id IN (2, 4)")
rows = cursor.fetchall()

for tool_id, name, tool_type, config_json in rows:
    print(f"\n{'='*60}")
    print(f"Tool ID: {tool_id}")
    print(f"Name: {name}")
    print(f"tool_type: '{tool_type}' (type: {type(tool_type).__name__})")
    
    if config_json:
        config = json.loads(config_json)
        print(f"Configuration keys: {list(config.keys())}")
        if 'gui_schema' in config:
            print(f"Has gui_schema: Yes")
            print(f"gui_schema: {json.dumps(config.get('gui_schema'), indent=2)[:500]}")
        if 'selected_functions' in config:
            print(f"selected_functions: {config.get('selected_functions')}")
    print(f"{'='*60}")

conn.close()
