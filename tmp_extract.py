
import re

def extract_strings(filename, min_len=4):
    with open(filename, 'rb') as f:
        data = f.read()
        # Find sequences of printable characters
        # encoding utf-8, ignore errors
        text = data.decode('utf-8', errors='ignore')
        # We might lose boundaries this way if it's mixed with binary, 
        # but let's try a simpler regex on bytes
        
    # Regex for printable chars in bytes
    # 32 (space) to 126 (~) 
    # Plus newlines
    pattern = re.compile(b'[\x20-\x7E\n\r\t]{4,}')
    
    strings = []
    for match in pattern.finditer(data):
        try:
            s = match.group().decode('utf-8')
            strings.append(s)
        except:
            pass
            
    return strings

file_path = r"C:\Users\opole\.gemini\antigravity\conversations\99f15336-e621-4d37-ab2d-dd9fbf6dc13c.pb"
found = extract_strings(file_path)

print(f"Found {len(found)} strings. Showing first 20:")
for s in found[:20]:
    print(f"--- {s} ---")
