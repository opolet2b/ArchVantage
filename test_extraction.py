import requests

payload = {
    "llm_config_id": "gpt-3.5-turbo",
    "sources": [
        {
            "id": "test-123",
            "type": "local",
            "name": "Test Local Source",
            "config": {
                 "path": "C:\\Users\\opole\\Downloads\\ChatBotn\\test_docs" 
            }
        }
    ]
}

try:
    print("Sending request...")
    res = requests.post("http://127.0.0.1:8000/api/v1/knowledge/extract-taxonomy", json=payload, headers={"Authorization": "Bearer fake_token"})
    print(f"Status: {res.status_code}")
    print(f"Body: {res.text}")
except Exception as e:
    print(f"Request failed: {e}")
