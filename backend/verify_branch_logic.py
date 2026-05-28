import asyncio
from app.services.agent_primitives.logic_primitives import LogicIfElsePrimitive
from app.services.agent_primitives.pipeline_primitive import GenericPipelinePrimitive

async def main():
    state = {
        "variables": {"IS_PROPOSAL": "False"}
    }
    
    params = {
        "condition": "is",
        "context": "{{IS_PROPOSAL}}",
        "compare_value": "True",
        "eval_type": "strict",
        "_node_label": "IF_NODE",
        "then_steps": [
            {
                "primitive": "CANVAS_SET_PROPERTY",
                "inputs": {"title": "TRUE_BRANCH_EXECUTED"}
            }
        ],
        "else_steps": [
            {
                "primitive": "CANVAS_SET_PROPERTY",
                "inputs": {"title": "FALSE_BRANCH_EXECUTED"}
            }
        ]
    }
    
    primitive = LogicIfElsePrimitive()
    result = await primitive.execute(params, state)
    
    print("\n--- LogicIfElsePrimitive Result ---")
    print(f"Success: {result.success}")
    if not result.success:
        print(f"Error: {result.error}")
    else:
        print(f"Output: {result.output}")
        print(f"Steps: {result.steps}")

if __name__ == "__main__":
    asyncio.run(main())
