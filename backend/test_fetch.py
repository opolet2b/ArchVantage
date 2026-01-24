import urllib.request
import urllib.error

url = "http://localhost:8000/api/v1/assets/110dfd71-d70f-40c4-8d2a-39ac23128851"
print(f"Testing URL: {url}")

try:
    req = urllib.request.Request(url, method="HEAD")
    with urllib.request.urlopen(req) as response:
        print(f"Status: {response.status}")
except urllib.error.HTTPError as e:
    print(f"HTTP Error: {e.code} {e.reason}")
    if e.code == 401:
        print("SUCCESS: Endpoint exists and requires auth (as expected).")
    elif e.code == 404:
        print("FAILURE: Endpoint or Asset not found.")
except urllib.error.URLError as e:
    print(f"Connection Error: {e.reason}")
except Exception as e:
    print(f"Error: {e}")
