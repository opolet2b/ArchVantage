
import requests
import json
import uuid

# Base URL of the API
BASE_URL = "http://localhost:8000/api/v1"

# Headers - Replace with a valid token if authentication is enabled
HEADERS = {
    "Content-Type": "application/json",
    "Authorization": "Bearer YOUR_ACCESS_TOKEN" # You need to fill this or run without auth
}

def test_link_creation():
    # 1. Get or Create a Canvas
    # (Assuming we have a canvas ID and a valid user)
    canvas_id = "test-canvas-id" # Need to replace with existing or create new
    
    # 2. Create two things
    thing1_resp = requests.post(
        f"{BASE_URL}/canvases/{canvas_id}/things",
        headers=HEADERS,
        json={
            "type": "text",
            "content": {"text": "Source Thing"},
            "position": {"x": 100, "y": 100},
            "title": "Source"
        }
    )
    if thing1_resp.status_code != 200:
        print(f"Failed to create thing 1: {thing1_resp.text}")
        return
    thing1_id = thing1_resp.json()["id"]

    thing2_resp = requests.post(
        f"{BASE_URL}/canvases/{canvas_id}/things",
        headers=HEADERS,
        json={
            "type": "text",
            "content": {"text": "Target Thing"},
            "position": {"x": 300, "y": 300},
            "title": "Target"
        }
    )
    if thing2_resp.status_code != 200:
        print(f"Failed to create thing 2: {thing2_resp.text}")
        return
    thing2_id = thing2_resp.json()["id"]

    # 3. Try to create a link (This is where the AttributeError occurred)
    link_resp = requests.post(
        f"{BASE_URL}/canvases/{canvas_id}/links",
        headers=HEADERS,
        json={
            "source_id": thing1_id,
            "target_id": thing2_id,
            "type": "association", # This is a string in the schema
            "label": "Test Link"
        }
    )

    if link_resp.status_code == 200:
        print("Link created successfully!")
    else:
        print(f"Failed to create link: {link_resp.status_code}")
        print(f"Response: {link_resp.text}")

if __name__ == "__main__":
    # Note: This script requires a running server and valid credentials.
    # For automated CI-like tests, we would use pytest and TestClient.
    print("repro_link_bug.py - Verification Script")
    # test_link_creation() # Uncomment and set parameters to run manually
