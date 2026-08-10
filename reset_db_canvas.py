import sqlite3
import json

db_path = r'C:\Users\opole\Documents\Work\T2B\Projects\Internal\ArchVantage\backend\db\sql_app.db'
conn = sqlite3.connect(db_path)
c = conn.cursor()

c.execute("SELECT id, type, content FROM canvas_things WHERE canvas_id='3a710df9-239d-45ba-9ab4-5b9f2c22ab96'")
rows = c.fetchall()

print(f"Found {len(rows)} things in canvas")
for row in rows:
    thing_id, thing_type, content_json = row
    content = json.loads(content_json)
    
    if content.get('matrixState') or thing_type.lower() == 'trade_off_matrix':
        step = content.get('matrixState', {}).get('step')
        print(f"Thing ID: {thing_id}, Type: {thing_type}, Step: {step}")
        
        if step == 'GENERATING':
            content['matrixState']['step'] = 'VALIDATING'
            c.execute('UPDATE canvas_things SET content = ? WHERE id = ?', (json.dumps(content), thing_id))
            conn.commit()
            print("-> Reset to VALIDATING and saved to DB")
