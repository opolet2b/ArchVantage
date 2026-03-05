import sqlite3
import json
import os

DB_PATH = r"C:\Users\opole\Downloads\ChatBotn\backend\db\sql_app.db"

def dump_blocks(blocks, indent=0):
    lines = []
    if not isinstance(blocks, list):
        return [f"{'  ' * indent}[Error: blocks is not a list: {type(blocks)}]"]
    for b in blocks:
        b_type = b.get("type", "unknown")
        assign = f" [ASSIGN: {b.get('assignTo') or b.get('assign_to')}]" if (b.get('assignTo') or b.get('assign_to')) else ""
        title = f" [{b.get('title')}]" if b.get("title") else ""
        content = (b.get("content") or "").replace("\n", " ")
        if len(content) > 100:
            content = content[:97] + "..."
        
        lines.append(f"{'  ' * indent}- {b_type}{title}{assign}: {content}")
        if "children" in b and b["children"]:
            lines.extend(dump_blocks(b["children"], indent + 1))
    return lines

conn = sqlite3.connect(DB_PATH)
cursor = conn.cursor()

try:
    rows = cursor.execute("SELECT name, structure FROM templates WHERE name = 'Comparison'").fetchall()
    with open(r"C:\Users\opole\Downloads\ChatBotn\backend\db\dump_output.txt", "w", encoding="utf-8") as f:
        for name, struct_json in rows:
            f.write(f"\nTemplate: {name}\n")
            struct = json.loads(struct_json)
            blocks = struct.get("blocks", [])
            for line in dump_blocks(blocks):
                f.write(line + "\n")
finally:
    conn.close()
