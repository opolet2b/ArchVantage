
import asyncio
import sys
import os
import json

# Add the backend directory to sys.path
sys.path.append(os.path.join(os.getcwd(), "backend"))

from app.services.agent_primitives.pipeline_primitive import GenericPipelinePrimitive
from app.services.agent_runtime import AgentRuntime

async def test_harvesting():
    print("Testing variable harvesting across loop iterations (No LLM)...")
    
    # We will use a ForEach via GenericPipelinePrimitive directly
    # To trigger the _foreach_subprocess logic, the primitive must return it.
    # Query primitives do this. We'll mock a primitive that returns _foreach_subprocess.
    
    class MockLoopPrimitive:
        async def execute(self, params, state):
            from app.services.agent_primitives.base import PrimitiveResult
            return PrimitiveResult(
                success=True,
                output={
                    "_foreach_subprocess": [
                        {
                            "id": "set_var",
                            "primitive": "LOGIC_SET_VARIABLE",
                            "inputs": {
                                "variables": {
                                    "HAS_SKILLS": "yes"
                                }
                            }
                        }
                    ],
                    "_foreach_items": [1],
                    "_foreach_iterator": "item",
                    "foreach_results": []
                }
            )

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
                "primitive": "MOCK_LOOP",
                "inputs": {}
            }
        ]
    }
    
    state = {
        "variables": {},
        "inputs": {},
        "db": None
    }
    
    # Register mock primitive
    import app.services.agent_primitives.pipeline_primitive as pp
    pp.PRIMITIVE_REGISTRY["MOCK_LOOP"] = MockLoopPrimitive
    pp.PRIMITIVE_REGISTRY["LOGIC_SET_VARIABLE"] = pp.GenericPipelinePrimitive # This is wrong, but I'll fix it
    
    # Actually, LOGIC_SET_VARIABLE is in logic_primitives.py
    from app.services.agent_primitives.logic_primitives import LogicSetVariablePrimitive
    pp.PRIMITIVE_REGISTRY["LOGIC_SET_VARIABLE"] = LogicSetVariablePrimitive

    runner = GenericPipelinePrimitive()
    
    print("Executing pipeline...")
    await runner.execute(pipeline, state)
    
    print(f"Vars after Loop: {list(state['variables'].keys())}")
    
    if "HAS_SKILLS" in state["variables"]:
        print("SUCCESS: HAS_SKILLS harvested correctly!")
    else:
        print("FAILURE: HAS_SKILLS is missing!")
    
    if "BASE_VAR" in state["variables"]:
        print("SUCCESS: BASE_VAR preserved!")
    else:
        print("FAILURE: BASE_VAR lost!")

if __name__ == "__main__":
    asyncio.run(test_harvesting())
