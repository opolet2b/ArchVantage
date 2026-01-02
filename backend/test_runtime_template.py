
import sys
import os
import asyncio
import json
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# Add backend to path
sys.path.append(os.path.join(os.path.dirname(__file__), "app"))

from app.core.database import Base
from app.models.user import User # Fix registry error
from app.models.agent_blueprint import AgentBlueprint
from app.services.agent_runtime import AgentRuntime
import inspect
print(f"DEBUG: AgentRuntime loaded from: {inspect.getfile(AgentRuntime)}")

# DB Connection
from app.core.database import SessionLocal
db = SessionLocal()

BLUEPRINT_ID = "f9d9ee3e-eafb-48b9-b51d-ad97602cd1cd"

async def test_runtime():
    print(f"Loading Blueprint {BLUEPRINT_ID}...")
    blueprint = db.query(AgentBlueprint).filter(AgentBlueprint.id == BLUEPRINT_ID).first()
    if not blueprint:
        print("Blueprint not found!")
        return

    print("Initializing Runtime...")
    graph = blueprint.graph
    if isinstance(graph, str):
        graph = json.loads(graph)
        
    # Mock inputs
    inputs = {"user_info": "Test User"} # To satisfy potential inputs
    
    runtime = AgentRuntime(blueprint=blueprint, db=db)
    
    print("Executing...")
    result = await runtime.execute(inputs=inputs)
    
    print(f"Initial Status: {result.get('status')}")
    
    if result.get('status') == "waiting_for_input":
        print("--- PAUSED FOR INPUT ---")
        # Simulating User Input
        # We need to know what input is expected, but for this test we'll assume the 'user_info' tool form.
        # We'll inject variables that match what the form output would look like.
        
        waiting_node = result.get("waiting_node")
        print(f"Waiting Node: {waiting_node}")
        
        # Mock Form Submission
        form_data = {
            "first_name": "jean",
            "last_name": "Tester", 
            "email": "jean@test.com"
        }
        print(f"Submitting Input: {form_data}")
        
        # Resume using the FULL internal state, not just variables
        resumed_state = runtime.resume_with_input(result.get("full_state"), form_data)
        
        print(f"Resuming Execution from state with current_node: {resumed_state.get('current_node')}...")
        result = await runtime.execute(inputs=inputs, initial_state=resumed_state)

    with open("result.txt", "w") as f:
        f.write("--- FINAL EXECUTION PATH ---\n")
        steps = result.get("steps", [])
        for s in steps:
            f.write(f"NODE: {s.get('node_type')} | LABEL: {s.get('node_label')} | STATUS: {s.get('status')}\n")
        
        f.write("\n--- OUTPUTS ---\n")
        outputs = result.get("outputs", {})
        f.write(json.dumps(outputs, indent=2))
        
        f.write("\n\n--- COMPLIANCE ---\n")
        if "final_output" in outputs:
            f.write("RESULT: SUCCESS - Template Applied\n")
        else:
            f.write("RESULT: FAIL - Template Missing\n")
            # Debug info
            end_node = None
            for nid, node in runtime.nodes.items():
                n_type = node.get("type") if isinstance(node, dict) else node.type
                if hasattr(n_type, "value"): n_type = n_type.value
                if n_type == "END":
                    end_node = node
                    break
            if end_node:
                params = end_node.get("params") if isinstance(end_node, dict) else end_node.params
                f.write(f"End Node Params: {params}\n")

if __name__ == "__main__":
    asyncio.run(test_runtime())
