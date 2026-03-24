
import asyncio
import sys
import os
import json

# Add the backend directory to sys.path
sys.path.append(os.path.join(os.getcwd(), "backend"))

from app.services.agent_primitives.pipeline_primitive import GenericPipelinePrimitive
from app.services.agent_runtime import AgentRuntime

async def test_harvesting():
    print("Testing variable harvesting across loop iterations...")
    
    pipeline = {
        "steps": [
            {
                "id": "init",
                "primitive": "LOGIC_SET_VARIABLE",
                "inputs": {
                    "variables": {
                        "BASE_VAR": "hello"
                    }
                }
            },
            {
                "id": "loop_step",
                "primitive": "LOGIC_IF_ELSE",
                "inputs": {
                    "mode": "iterative",
                    "items": "[1, 2]",
                    "condition": "is not",
                    "context": "{{item}}",
                    "compare_value": "empty",
                    "then_steps": [
                        {
                            "id": "set_skills",
                            "primitive": "LOGIC_SET_VARIABLE",
                            "inputs": {
                                "variables": {
                                    "HAS_SKILLS": "yes"
                                }
                            }
                        }
                    ],
                    "else_steps": []
                }
            }
        ]
    }
    
    state = {
        "variables": {},
        "inputs": {},
        "db": None
    }
    
    primitive = GenericPipelinePrimitive()
    print("Executing Step 1 (Init)...")
    await GenericPipelinePrimitive().execute({"steps": [pipeline["steps"][0]]}, state)

    print("Executing Step 2 (Loop)...")
    await GenericPipelinePrimitive().execute({"steps": [pipeline["steps"][1]]}, state)
    
    print(f"Vars after Loop: {list(state['variables'].keys())}")
    
    if "HAS_SKILLS" in state["variables"]:
        print("SUCCESS: HAS_SKILLS found at top-level!")
    else:
        print("FAILURE: HAS_SKILLS missing from top-level!")
        
    if "output" in state["variables"]:
        print(f"Content of 'output': {json.dumps(state['variables']['output'], indent=2)}")
    
    if "results" in state["variables"]:
        print(f"Content of 'results': {json.dumps(state['variables']['results'], indent=2)}")

if __name__ == "__main__":
    asyncio.run(test_harvesting())
