import sys
import os

sys.path.append(os.getcwd())

from app.services.prompt_service import prompt_service
from app.prompts import EXPLAIN_PROMPT, ALL_PROMPTS
from app.core.database import SessionLocal

def test_prompts():
    print("Testing Prompt Service...")
    
    # 1. Register
    print(f"Registering {len(ALL_PROMPTS)} prompts...")
    try:
        prompt_service.register_prompts(ALL_PROMPTS)
        print("Registration successful.")
    except Exception as e:
        print(f"Registration failed: {e}")
        return

    # 2. Get Prompt
    print(f"Retrieving prompt: {EXPLAIN_PROMPT.key}")
    try:
        prompt = prompt_service.get_prompt(
            EXPLAIN_PROMPT.key,
            variables={"content": "TEST CONTENT"},
            user_id=1 # assuming admin exists
        )
        print(f"Prompt retrieved: {prompt[:50]}...")
    except Exception as e:
        print(f"Get prompt failed: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    test_prompts()
