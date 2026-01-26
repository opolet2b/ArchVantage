import requests
import json
import sys

API_URL = "http://127.0.0.1:8000/api/v1"

def login():
    try:
        response = requests.post(
            f"{API_URL}/auth/token",
            data={"username": "admin@example.com", "password": "admin123"},
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            timeout=10
        )
        response.raise_for_status()
        return response.json()["access_token"]
    except Exception as e:
        with open("debug_output.txt", "a") as f:
            f.write(f"Login failed: {e}\n")
            if 'response' in locals():
                 f.write(f"Response: {response.text}\n")
        return None

def reproduce_analysis():
    with open("debug_output.txt", "w") as f:
        f.write("Starting reproduction...\n")

    token = login()
    if not token:
        return

    headers = {"Authorization": f"Bearer {token}"}
    
    try:
        # 1. Get a canvas (or list them)
        canvases = requests.get(f"{API_URL}/canvases", headers=headers, timeout=10).json()
        if not canvases:
            with open("debug_output.txt", "a") as f: f.write("No canvases found.\n")
            return
        canvas_id = canvases[0]["id"]
        
        # 2. Get a thing
        things = requests.get(f"{API_URL}/canvases/{canvas_id}/things", headers=headers, timeout=10).json()
        if not things:
            with open("debug_output.txt", "a") as f: f.write("No things found.\n")
            return
        thing_id = things[0]["id"]
        
        # 3. Call Analyze
        payload = {
            "thing_id": thing_id,
            "fragment": {
                "type": "text",
                "content": "This is a test content to explain.",
            },
            "action": "explain",
            "model": "default"
        }
        
        with open("debug_output.txt", "a") as f:
            f.write(f"Sending request to {API_URL}/canvases/{canvas_id}/analyze\n")
        
        response = requests.post(
            f"{API_URL}/canvases/{canvas_id}/analyze",
            json=payload,
            headers=headers,
            timeout=120
        )
        
        with open("debug_output.txt", "a") as f:
            f.write(f"Response Status: {response.status_code}\n")
            f.write(f"Response Body: {response.text}\n")

    except Exception as e:
        with open("debug_output.txt", "a") as f:
            f.write(f"Test failed exception: {e}\n")

if __name__ == "__main__":
    reproduce_analysis()
