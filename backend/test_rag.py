import requests
import json

BASE_URL = "http://127.0.0.1:8000/api/v1"

def test_ingest():
    print("Testing Ingestion...")
    response = requests.post(
        f"{BASE_URL}/rag/ingest",
        json={"folder_path": "./data"}
    )
    print(f"Status: {response.status_code}")
    print(f"Response: {response.json()}")

def test_query():
    print("\nTesting Query...")
    response = requests.post(
        f"{BASE_URL}/rag/query",
        json={"query": "What is the RAG system using?", "k": 2}
    )
    print(f"Status: {response.status_code}")
    print(f"Response: {json.dumps(response.json(), indent=2)}")

def test_watcher_query():
    print("\nTesting Watcher Query...")
    # Wait a bit for ingestion
    import time
    time.sleep(2)
    response = requests.post(
        f"{BASE_URL}/rag/query",
        json={"query": "automatic ingestion", "k": 2}
    )
    print(f"Status: {response.status_code}")
    print(f"Response: {json.dumps(response.json(), indent=2)}")

if __name__ == "__main__":
    # test_ingest()
    # test_query()
    test_watcher_query()
