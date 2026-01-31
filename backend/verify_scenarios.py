import requests
import json
import sys

API_URL = "http://localhost:8000/api/v1"
ADMIN_EMAIL = "admin@example.com"
PASSWORD = "admin123"

def login():
    print(f"Logging in as {ADMIN_EMAIL}...")
    try:
        resp = requests.post("http://localhost:8000/api/v1/auth/token", data={
            "username": ADMIN_EMAIL,
            "password": PASSWORD
        })
        if resp.status_code != 200:
            print(f"Login failed: {resp.text}")
            sys.exit(1)
        return resp.json()["access_token"]
    except Exception as e:
        print(f"Connection failed: {e}")
        sys.exit(1)

def run_tests():
    token = login()
    headers = {"Authorization": f"Bearer {token}"}

    # 1. Create Scenario
    print("\n1. Creating Test Scenario...")
    scenario_data = {
        "name": "Research Workspace",
        "description": "A workspace for deep research with specialized domains.",
        "icon": "flask",
        "theme_color": "#8b5cf6", # Violet
        "configuration": {
            "ui_overrides": {
                "toolbox_macros": [{"id": "find_papers", "label": "Find Papers"}]
            },
            "domain_definitions": [
                {
                    "id": "hypothesis",
                    "label": "Hypothesis",
                    "visual_config": {"primary_color": "#ef4444", "icon": "lightbulb"}
                },
                {
                    "id": "evidence",
                    "label": "Evidence",
                    "visual_config": {"primary_color": "#22c55e", "icon": "file-text"}
                }
            ],
            "initialization": {
                "master_canvas": {
                    "domains": [
                        {"type": "hypothesis", "x": 100, "y": 100, "w": 300, "h": 200},
                        {"type": "evidence", "x": 500, "y": 100, "w": 300, "h": 400}
                    ],
                    "ghost_nodes": [
                        {"label": "Research Question", "x": 150, "y": 150, "on_drop": "trigger_search"}
                    ]
                }
            }
        }
    }

    resp = requests.post(f"{API_URL}/scenarios/", json=scenario_data, headers=headers)
    if resp.status_code != 200:
        print(f"Failed to create scenario: {resp.text}")
        return
    
    scenario = resp.json()
    print(f"   Success! Created Scenario ID: {scenario['id']}")

    # 2. List Scenarios
    print("\n2. Listing Scenarios...")
    resp = requests.get(f"{API_URL}/scenarios/", headers=headers)
    scenarios = resp.json()
    print(f"   Found {len(scenarios)} scenarios.")
    assert any(s['id'] == scenario['id'] for s in scenarios)

    # 3. Instantiate Scenario
    print("\n3. Instantiating Scenario...")
    instantiate_data = {
        "scenario_id": scenario['id'],
        "canvas_name": "My Research Project"
    }
    resp = requests.post(f"{API_URL}/scenarios/{scenario['id']}/instantiate", json=instantiate_data, headers=headers)
    if resp.status_code != 200:
        print(f"Failed to instantiate: {resp.text}")
        return

    canvas = resp.json()
    print(f"   Success! Created Canvas ID: {canvas['id']}")
    
    # 4. Verify Content
    print("\n4. Verifying Canvas Content...")
    resp = requests.get(f"{API_URL}/canvases/{canvas['id']}", headers=headers)
    canvas_full = resp.json()
    
    domains = canvas_full.get('domains', [])
    things = canvas_full.get('things', [])
    
    print(f"   Domains: {len(domains)} (Expected 2)")
    print(f"   Things: {len(things)} (Expected 1 Ghost Node)")
    
    assert len(domains) == 2
    assert len(things) == 1
    
    # Check domain types and visual config
    hyp_domain = next((d for d in domains if d['name'] == "Hypothesis"), None)
    assert hyp_domain is not None
    print(f"   Found Hypothesis domain with color: {hyp_domain['color']}") # Should match definition or fallbacks
    
    # Check ghost node
    ghost = things[0]
    print(f"   Found Ghost Node: {ghost['title']}, Content: {ghost['content']}")
    assert ghost['content'].get('is_ghost') == True

    print("\n\nVERIFICATION SUCCESSFUL!")

if __name__ == "__main__":
    run_tests()
