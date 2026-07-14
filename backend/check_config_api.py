import urllib.request
import json

def check():
    try:
        req = urllib.request.Request('http://localhost:8000/api/v1/config/editor')
        with urllib.request.urlopen(req) as response:
            print("Status:", response.status)
            print("Response:", response.read().decode())
    except urllib.error.HTTPError as e:
        print("HTTP Error:", e.code, e.reason)
        print("Response:", e.read().decode())
    except Exception as e:
        print("Error:", e)

if __name__ == '__main__':
    check()
