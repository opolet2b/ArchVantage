import json

try:
    with open("template_config.json", "r", encoding="utf-16") as f:
        content = f.read()
    
    # Verify it parses as JSON
    data = json.loads(content)
    
    with open("template_config_utf8.json", "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
        
    print("Success: Converted to template_config_utf8.json")
    
except Exception as e:
    print(f"Error: {e}")
    # Fallback: maybe it IS utf-8 and previous errors were misleading?
    try:
        with open("template_config.json", "r", encoding="utf-8") as f:
            content = f.read()
            data = json.loads(content)
            print("Actually, it was UTF-8 all along.")
            with open("template_config_utf8.json", "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2)
    except Exception as e2:
        print(f"Double Error: {e2}")
