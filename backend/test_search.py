import requests
import json

BASE_URL = "http://127.0.0.1:8000/api/v1"

def test_search():
    print("Testing Web Search...")
    response = requests.post(
        f"{BASE_URL}/search",
        json={"query": "What is the capital of France?"}
    )
    print(f"Status: {response.status_code}")
    print(f"Response: {json.dumps(response.json(), indent=2)}")

if __name__ == "__main__":
    test_search()
