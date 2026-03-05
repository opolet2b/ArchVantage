import sqlite3
import json

conn = sqlite3.connect('sql_app.db')
c = conn.cursor()
c.execute("SELECT id, name, structure FROM templates WHERE name LIKE '%Comparison%'")
rows = c.fetchall()

if not rows:
    print("No Comparison template found.")

with open('comparison_ast.txt', 'w', encoding='utf-8') as f:
    for r in rows:
        f.write(f'Template: {r[1]}\n')
        struct = json.loads(r[2]) if r[2] else {}
        blocks = struct.get('blocks', []) if isinstance(struct, dict) else struct
        f.write(f"Template: {r[1]} (id: {r[0]})\n")
        struct = json.loads(r[2])
        blocks = struct.get("blocks", [])
        f.write("\n".join(dump_blocks(blocks)))
        f.write("\n\n")
