import requests
import json
import time

# 1. Login to get token
res = requests.post("http://127.0.0.1:8000/api/v1/auth/login", data={"username": "admin@example.com", "password": "adminpassword"})
if not res.ok:
    print("Login failed:", res.text)
    exit(1)
token = res.json()["access_token"]
headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

# 2. Get templates
res = requests.get("http://127.0.0.1:8000/api/v1/templates", headers=headers)
templates = res.json()
if not templates:
    print("No templates found")
    exit(1)
template_id = templates[0]["id"]
print(f"Using template_id: {template_id}")

# 3. Start workflow
res = requests.post("http://127.0.0.1:8000/api/v1/workflows/instances/start", headers=headers, json={
    "template_id": template_id,
    "canvas_id": "debug_canvas",
    "initial_payload": {},
    "is_debug": True
})
if not res.ok:
    print("Failed to start workflow:", res.text)
    exit(1)
instance_id = res.json()["id"]
print(f"Started instance_id: {instance_id}")

# 4. Stream SSE
url = f"http://127.0.0.1:8000/api/v1/workflows/instances/{instance_id}/stream?token={token}"
print(f"Connecting to SSE: {url}")
response = requests.get(url, stream=True)

start_time = time.time()
for chunk in response.iter_content(chunk_size=None):
    if chunk:
        print(f"[{time.time() - start_time:.2f}s] Received chunk:")
        print(chunk.decode('utf-8'))
        if b"WAITING" in chunk:
            print("Saw WAITING! Breaking out of stream.")
            break
    if time.time() - start_time > 10:
        print("Timeout waiting for WAITING")
        break
