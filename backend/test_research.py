import requests
import json

BASE_URL = "http://127.0.0.1:8000/api/v1"

def test_research():
    print("Testing Deep Research...")
    response = requests.post(
        f"{BASE_URL}/research",
        json={"query": "Who won the last Super Bowl and what was the score?"}
    )
    print(f"Status: {response.status_code}")
    try:
        print(f"Response: {json.dumps(response.json(), indent=2)}")
    except:
        print(f"Raw Response: {response.text}")

if __name__ == "__main__":
    test_research()
