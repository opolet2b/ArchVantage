import sqlite3
import os
import pandas as pd
import json

def check():
    conn = sqlite3.connect('c:/Users/opole/Downloads/ChatBotn/backend/db/sql_app.db')
    c = conn.cursor()
    c.execute("SELECT content FROM canvas_things WHERE id='71c23693-3772-4399-92ca-184d7a85b3da'")
    row = c.fetchone()
    content = json.loads(row[0])
    asset_id = content.get("asset_id")
    c.execute(f"SELECT file_path FROM assets WHERE id='{asset_id}'")
    file_path_suffix = c.fetchone()[0]
    
    # Properly construct path using data_storage
    base = r"c:\Users\opole\Downloads\ChatBotn\backend\data_storage"
    path = os.path.join(base, file_path_suffix.replace('/', '\\'))
    print("Path is:", path)
    print("Exists?", os.path.exists(path))
    
    if os.path.exists(path):
        try:
            df = pd.read_excel(path, sheet_name=None)
            print("Successfully read excel!")
            for k, v in df.items():
                print(f"  Sheet {k}: {v.shape}")
                # Try to output first few rows as markdown just to test if that hangs
                try:
                    md = v.head(5).to_markdown(index=False)
                    print(f"    Markdown sample (first 5 rows) generated: {len(md)} chars")
                except Exception as e:
                    print(f"    Markdown error: {e}")
        except Exception as e:
            import traceback
            print("Error reading excel:", e)
            traceback.print_exc()

if __name__ == '__main__':
    check()
