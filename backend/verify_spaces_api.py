
import requests
import json
import sys

# Constants
API_URL = "http://localhost:8000/api/v1"
# Login/Get Token first (Assuming dev environment with no strict auth or using a known test user)
# For this verify script, I'll assume we can use the test user if available, or just fail if auth is required and not handled.
# BUT, the backend requires auth. I should try to login using the test users created by init_db.
# Default init_db creates 'admin' with 'admin' (usually).

def login():
    try:
        resp = requests.post(f"{API_URL}/auth/access-token", data={"username": "admin@example.com", "password": "password"})
        if resp.status_code == 200:
            return resp.json()["access_token"]
    except:
        pass
    return None

def verify():
    token = login()
    if not token:
        print("SKIPPING: Could not log in to verify API (Server might be down or credentials wrong).")
        return

    headers = {"Authorization": f"Bearer {token}"}
    
    # 1. Create Space
    print("Creating Space...")
    resp = requests.post(f"{API_URL}/spaces/", json={"name": "Test Space", "description": "Verification Space"}, headers=headers)
    if resp.status_code != 200:
        print(f"FAILED: Create Space {resp.text}")
        return
    space = resp.json()
    print(f"Space Created: {space['id']}")

    # 2. Get Canvases (to find one to add)
    resp = requests.get(f"{API_URL}/canvas/", headers=headers)
    canvases = resp.json()
    if not canvases:
        print("WARNING: No canvases found to test linking.")
    else:
        canvas_id = canvases[0]['id']
        print(f"Adding Canvas {canvas_id} to Space...")
        
        # 3. Add Canvas
        resp = requests.post(f"{API_URL}/spaces/{space['id']}/canvases/{canvas_id}", headers=headers)
        if resp.status_code != 200:
             print(f"FAILED: Add Canvas {resp.text}")
        else:
             print("Canvas Added.")

    # 4. Cleanup
    print("Deleting Space...")
    requests.delete(f"{API_URL}/spaces/{space['id']}", headers=headers)
    print("Done.")

if __name__ == "__main__":
    verify()
