import httpx

def test_exists():
    auth = ("root", "playwithdata")
    host = "http://localhost:2480"
    db_name = "knowledge_graph"
    url = f"{host}/api/v1/exists/{db_name}"
    
    print(f"GET {url}")
    try:
        with httpx.Client(auth=auth) as client:
            res = client.get(url)
            print("Status Code:", res.status_code)
            print("Response:", res.text)
            
    except Exception as e:
        print("Exception:", e)

if __name__ == "__main__":
    test_exists()
