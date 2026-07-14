import sqlite3

def check():
    with open('c:/Users/opole/Downloads/ChatBotn/backend/logs_dump.txt', 'w', encoding='utf-8') as out:
        out.write("Recent app logs:\n")
        try:
            with open('c:/Users/opole/Downloads/ChatBotn/backend/app_debug.log', 'r', encoding='utf-8', errors='replace') as f:
                lines = f.readlines()
                for line in lines[-500:]:
                    if "skillsmatrix" in line or "processing" in line.lower() or "canvasworker" in line.lower() or "error" in line.lower() or "ingest" in line.lower():
                        out.write(line)
        except Exception as e:
            out.write(str(e) + "\n")
            
        out.write("\nRecent execution logs:\n")
        try:
            with open('c:/Users/opole/Downloads/ChatBotn/backend/execution_debug.log', 'r', encoding='utf-8', errors='replace') as f:
                lines = f.readlines()
                for line in lines[-1000:]:
                    if "skillsmatrix" in line or "canvasworker" in line.lower() or "ingest" in line.lower() or "error" in line.lower() or "exception" in line.lower():
                        out.write(line)
        except Exception as e:
            out.write(str(e) + "\n")

if __name__ == '__main__':
    check()
