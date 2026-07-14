import sys

def check_logs():
    found = False
    try:
        with open('c:/Users/opole/Downloads/ChatBotn/backend/app_debug.log', 'r', encoding='utf-8', errors='replace') as f:
            for line in f:
                if 'WOPI' in line:
                    print("APP LOG:", line.strip())
                    found = True
    except:
        pass
        
    try:
        with open('c:/Users/opole/Downloads/ChatBotn/backend/execution_debug.log', 'r', encoding='utf-8', errors='replace') as f:
            for line in f:
                if 'WOPI' in line:
                    print("EXEC LOG:", line.strip())
                    found = True
    except:
        pass
        
    try:
        with open('c:/Users/opole/Downloads/ChatBotn/backend/venv/uvicorn.log', 'r', encoding='utf-8', errors='replace') as f:
            lines = f.readlines()
            for line in lines[-200:]:
                if 'wopi' in line.lower() or 'collabora' in line.lower():
                    print("UVICORN LOG:", line.strip())
                    found = True
    except:
        pass
        
    if not found:
        print("No WOPI logs found.")

if __name__ == '__main__':
    check_logs()
