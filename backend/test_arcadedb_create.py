import httpx
import sys

def test_create():
    auth = ("root", "playwithdata")
    host = "http://localhost:2480"
    db_name = "knowledge_graph"
    url = f"{host}/api/v1/server"
    payload = {"command": f"create database {db_name}"}
    
    print(f"POST {url} with {payload}")
    try:
        with httpx.Client(auth=auth) as client:
            res = client.post(url, json=payload)
            print("Status Code:", res.status_code)
            print("Response:", res.text)
            
            # Now let's test executing a command against the DB
            url_cmd = f"{host}/api/v1/command/{db_name}"
            payload_cmd = {
                "language": "sql",
                "command": "SELECT 1"
            }
            res_cmd = client.post(url_cmd, json=payload_cmd)
            print("\nCOMMAND POST", url_cmd, payload_cmd)
            print("Status Code:", res_cmd.status_code)
            print("Response:", res_cmd.text)

    except Exception as e:
        print("Exception:", e)

if __name__ == "__main__":
    test_create()
