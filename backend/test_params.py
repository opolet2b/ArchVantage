import sys
import os
import httpx
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.core.config import settings

def test_params(key_name):
    host = os.getenv("ARCADEDB_HOST", settings.ARCADEDB_HOST).rstrip('/')
    user = os.getenv("ARCADEDB_USER", settings.ARCADEDB_USER)
    password = os.getenv("ARCADEDB_PASSWORD", settings.ARCADEDB_PASSWORD)
    db_name = os.getenv("ARCADEDB_DATABASE", settings.ARCADEDB_DATABASE)
    
    url = f"{host}/api/v1/command/{db_name}"
    auth = (user, password)
    
    payload = {
        "language": "sql",
        "command": "INSERT INTO Entity SET name = :n RETURN @rid"
    }
    payload[key_name] = {"n": f"TestName_{key_name}"}
    
    print(f"Testing {key_name}...")
    try:
        with httpx.Client(auth=auth) as client:
            res = client.post(url, json=payload)
            print(f"Status: {res.status_code}")
            if res.status_code == 200:
                print(res.json())
                # verify if name is set
                rid = res.json().get('result', [{}])[0].get('@rid')
                res_check = client.post(f"{host}/api/v1/query/{db_name}", json={"language": "sql", "command": f"SELECT name FROM {rid}"})
                print(f"Inserted: {res_check.json().get('result')}")
            else:
                print(res.text)
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    test_params("parameters")
    test_params("params")
    test_params("args")
