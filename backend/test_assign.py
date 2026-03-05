import asyncio
from typing import Dict, Any
import sys
import os

# Ensure app is in path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__))))

from app.services.agent_primitives.text_template import TextTemplatePrimitive

async def main():
    primitive = TextTemplatePrimitive()
    
    template_content = """---
description: Test Template
---
## Extracted Info

<!-- INSTRUCTION [ASSIGN: names_list]: Extract the names of the people mentioned into a list. -->

Here are the names we found:
{{ names_list }}
"""
    source_text = "John Doe and Jane Smith went to the grocery store to buy apples."
    
    params = {
        "template_content": template_content,
        "source_text": source_text,
        "model": "gpt-4o-mini"
    }
    state = {
        "variables": {}
    }
    
    print("Executing TextTemplatePrimitive...")
    result = await primitive.execute(params, state)
    
    print("\n--- Result Output ---")
    if result.success:
        print(result.output["_raw"])
    else:
        print("Error:", result.error)
        
    print("\n--- State Variables ---")
    print(state.get("variables"))

if __name__ == "__main__":
    asyncio.run(main())
