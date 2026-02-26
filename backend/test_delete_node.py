import requests

resp = requests.post(
    "http://localhost:2480/api/v1/command/knowledge_graph",
    json={"language": "sql", "command": "DELETE FROM #12:3"},
    auth=("root", "playwithdata")
)
print(f"Status: {resp.status_code}")
print(resp.text)
