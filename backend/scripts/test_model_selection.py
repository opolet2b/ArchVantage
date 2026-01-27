import sys
import os

# Set up path to include app
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app.services.llm_service import llm_service
from app.services.config_service import config_service

def test_models():
    config = config_service.get_config()
    presets = config.get("presets", [])
    
    print(f"Found {len(presets)} presets.")
    
    for preset in presets:
        name = preset["name"]
        print(f"\nTesting initialization for: {name} ({preset.get('type')}, {preset.get('model_name')})")
        try:
            llm = llm_service._get_llama_index_model(name)
            print(f"  [SUCCESS] Initialized as {type(llm).__name__}")
            # Try a simple dummy invocation if local/remote? 
            # (Skipping real net calls to avoid latency/API costs unless requested)
        except Exception as e:
            print(f"  [FAILED] {str(e)}")

if __name__ == "__main__":
    test_models()
