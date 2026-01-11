import sys
import os
import json

# Add backend to path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.services.config_service import config_service

def debug_resolution():
    print("--- DEBUG CONFIG RESOLUTION ---")
    
    # 1. Load Config
    config = config_service.get_config()
    presets = config.get("presets", [])
    print(f"Loaded {len(presets)} presets.")
    
    target_name = "OpenRouter GPT-OSS 120"
    print(f"Looking for: '{target_name}'")
    
    # 2. Check Exact Match
    match = next((p for p in presets if p["name"] == target_name), None)
    
    if match:
        print("\n[SUCCESS] Found Preset!")
        print(json.dumps(match, indent=2))
        
        # Verify Key Fields for Vision Service
        print("\nVerifying Vision Service Fields:")
        print(f"- Type: {match.get('type')}")
        print(f"- Model Name: {match.get('model_name')}")
        print(f"- API URL: {match.get('api_url')}")
        print(f"- Configured as Vision?: {match.get('is_vision')}")
    else:
        print("\n[FAILURE] Preset NOT found.")
        print("Available Preset Names:")
        for p in presets:
            print(f" - '{p.get('name')}'")

if __name__ == "__main__":
    debug_resolution()
