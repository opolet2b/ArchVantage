#!/usr/bin/env python
"""Extract agent data for debugging - writes UTF-8 output."""
import sqlite3
import json

import sys
import os

# Add root to sys.path to allow importing app
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.core.database import get_db_path

db_path = get_db_path()
if not db_path:
    print("Database is not SQLite or not configured.")
    sys.exit(1)

conn = sqlite3.connect(db_path)
cursor = conn.cursor()

# Get all agents
cursor.execute("SELECT id, name, graph, inputs_schema FROM agent_blueprints")
rows = cursor.fetchall()

with open('agent_data.json', 'w', encoding='utf-8') as f:
    agents = []
    for row in rows:
        agent_id, name, graph_json, inputs_schema = row
        agent_data = {
            "id": agent_id,
            "name": name,
            "inputs_schema": inputs_schema,
            "graph": json.loads(graph_json) if graph_json else {}
        }
        agents.append(agent_data)
    
    json.dump(agents, f, indent=2, ensure_ascii=False)

print(f"Wrote {len(agents)} agents to agent_data.json")
conn.close()
