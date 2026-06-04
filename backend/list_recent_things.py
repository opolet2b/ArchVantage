with open(r"c:\Users\opole\Downloads\ChatBotn\frontend\src\components\semantic-canvas\canvas-store.ts", "r", encoding="utf-8") as f:
    lines = f.readlines()

for i, line in enumerate(lines):
    if "setinterval" in line.lower() or "settimeout" in line.lower() or "sync" in line.lower():
        print(f"Line {i+1}: {line.strip()}")
        # print 3 lines context
        start = max(0, i - 1)
        end = min(len(lines), i + 4)
        for j in range(start, end):
            prefix = "-> " if j == i else "   "
            print(f"{prefix}{j+1}: {lines[j].rstrip()}")
        print("=" * 60)
