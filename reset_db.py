import sqlite3
import json

db_path = r'C:\Users\opole\Downloads\ChatBotn\backend\db\sql_app.db'
conn = sqlite3.connect(db_path)
c = conn.cursor()

c.execute("SELECT name FROM sqlite_master WHERE type='table';")
print(c.fetchall())

c.execute("SELECT id, type, content FROM canvas_things")
rows = c.fetchall()

found = False
for row in rows:
    thing_id, thing_type, content_json = row
    if thing_type == 'trade_off_matrix':
        found = True
        content = json.loads(content_json)
        print(f'Thing ID: {thing_id}, Type: {thing_type}')
        print(f'Matrix State: {content.get("matrixState")}')
        
        if content.get('matrixState', {}).get('step') == 'GENERATING':
            content['matrixState']['step'] = 'VALIDATING'
            c.execute('UPDATE canvas_things SET content = ? WHERE id = ?', (json.dumps(content), thing_id))
            conn.commit()
            print('-> Reset to VALIDATING and saved to DB')

if not found:
    print("No trade_off_matrix found in DB!")
