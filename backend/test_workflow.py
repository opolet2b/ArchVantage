import requests
import json

BASE_URL = "http://127.0.0.1:8000/api/v1"

def test_workflow_execution():
    print("Testing Workflow Execution...")
    
    # Define a simple 2-node linear workflow
    workflow_def = {
        "nodes": [
            {"id": "1", "data": {"label": "Start Agent", "model": "gpt-3.5-turbo"}},
            {"id": "2", "data": {"label": "Review Agent", "model": "gpt-3.5-turbo"}}
        ],
        "edges": [
            {"source": "1", "target": "2"}
        ]
    }
    
    response = requests.post(
        f"{BASE_URL}/workflow/execute",
        json={
            "workflow_def": workflow_def,
            "input": "Write a short poem about AI."
        }
    )
    
    print(f"Status: {response.status_code}")
    try:
        print(f"Response: {json.dumps(response.json(), indent=2)}")
    except:
        print(f"Raw Response: {response.text}")

if __name__ == "__main__":
    test_workflow_execution()
