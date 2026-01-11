import requests
import sys

API_URL = "http://127.0.0.1:8000/api/v1"
CONVO_ID = "dc0c73dd-558c-4d37-a160-ef05c882f81e"

try:
    print(f"Checking Debug Endpoint for: {CONVO_ID}")
    url = f"{API_URL}/chat/context/{CONVO_ID}"
    print(f"GET {url}")
    
    response = requests.get(url)
    
    if response.status_code == 200:
        data = response.json()
        print("\n--- Response ---")
        print(f"Linked Items: {len(data.get('linked_items', []))}")
        for item in data.get('linked_items', []):
            print(f" - {item['title']} ({item['type']})")
            
        system_prompt = data.get('system_prompt_addendum')
        if system_prompt:
            print("\n[System Prompt Extract]")
            print(system_prompt[:300] + "...")
        else:
            print("\n[System Prompt] IS NULL/EMPTY")
            
        print("\n[Debug Log]")
        for log in data.get('debug_log', []):
            print(f" > {log}")
            
    else:
        print(f"Error: Status {response.status_code}")
        print(response.text)

except Exception as e:
    print(f"Connection Error: {e}")
    print("Ensure the server is running on localhost:8000")
