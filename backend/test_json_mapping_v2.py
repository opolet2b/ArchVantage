import asyncio
from app.services.agent_primitives.json_mapping import JSONMappingPrimitive

async def test_mapping():
    primitive = JSONMappingPrimitive()
    
    # Mock state
    state = {
        "variables": {
            "node1": {"first": "John", "last": "Doe", "age": 30},
            "api_res": {"items": [10, 20, 30]}
        },
        "current_output": {"status": "ok"}
    }
    
    # Test cases
    params = {
        "mappings": [
            {
                "target": "full_name",
                "expression": "node1.first + ' ' + node1.last"
            },
            {
                "target": "is_adult",
                "expression": "node1.age >= 18"
            },
            {
                "target": "total_items",
                "expression": "len(api_res.items)"
            },
            {
                "target": "item_sum",
                "expression": "sum(api_res.items)"
            },
            {
                "target": "description",
                "expression": "f'User {node1.first} has {len(api_res.items)} items'"
            },
             {
                "target": "math_test",
                "expression": "node1.age * 2 + 5"
            }
        ],
        "output_variable": "final_result"
    }
    
    print("Executing JSON Mapping with expressions...")
    result = await primitive.execute(params, state)
    
    if result.success:
        print("\nSuccess!")
        print("Output:", result.output["final_result"])
    else:
        print("\nFailed:", result.error)

if __name__ == "__main__":
    asyncio.run(test_mapping())
