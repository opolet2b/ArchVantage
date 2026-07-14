import urllib.request
import sys

def check():
    try:
        req = urllib.request.Request('http://localhost:9980/')
        with urllib.request.urlopen(req, timeout=3) as response:
            print("Status:", response.status)
    except Exception as e:
        print("Error:", e)

if __name__ == '__main__':
    check()
