with open("backend/app/routers/canvas_worker.py", "r", encoding="utf-8") as f:
    lines = f.readlines()

for idx in range(790, min(920, len(lines))):
    line = lines[idx]
    # show spaces, tabs, and start of content
    stripped = line.strip()
    indent = line[:len(line) - len(line.lstrip())]
    repr_indent = indent.replace(" ", "s").replace("\t", "T")
    print(f"{idx+1:04d}: [{repr_indent}] {stripped[:60]}")
