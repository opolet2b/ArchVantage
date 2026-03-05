import sqlite3
import json
import sys

conn = sqlite3.connect('db/sql_app.db')
c = conn.cursor()
c.execute('SELECT id, name, content, structure FROM templates')
rows = c.fetchall()

for row in rows:
    if row[3]:
        try:
            structure = json.loads(row[3])
            if 'diff_data' in str(structure):
                print(f'\n--- Template: {row[1]} ---')
                blocks = structure.get('blocks', []) if isinstance(structure, dict) else structure
                for block in blocks:
                    if block.get('type') == 'section' and 'Differences' in block.get('title', ''):
                        for child in block.get('children', []):
                            if 'diff_data' in str(child):
                                print(f"TYPE: {child.get('type')}")
                                print(f"CONTENT/TITLE: {child.get('content') or child.get('title')}")
                                if 'assignTo' in child: print(f"ASSIGNTO: {child.get('assignTo')}")
                                print("-" * 40)
                                sys.stdout.flush()
        except Exception as e:
            pass
