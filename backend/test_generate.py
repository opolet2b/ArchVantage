import requests
import json

url = "http://localhost:8000/api/v1/executive_summary/generate"
payload = {
    "source_docs": ["test document content"],
    "thing_id": "5ae4681a-c171-45ac-9723-18ba366245fa",
    "source_asset_ids": [],
    "llm_preset": "default",
    "vlm_preset": "default"
}

try:
    response = requests.post(url, json=payload, stream=True)
    for line in response.iter_lines():
        if line:
            print(line.decode('utf-8'))
except Exception as e:
    print(f"Failed to connect: {e}")
