import sys
import os

sys.path.append(os.getcwd())
from app.core.arcadedb import arcadedb

KB_ID = '562bf03d-f18e-4419-95c4-760709105cc0'

# List of classes to check (common ones)
classes = ['Entity', 'QuarantineEntity']
print(f"Targeting classes: {classes}")

update_count = 0
for cls in classes:
    res = arcadedb.query(f"SELECT @rid, source_uri FROM `{cls}` WHERE graph_id = :kb_id", params={"kb_id": KB_ID})
    for ent in res.get('result', []):
        old_uri = ent.get('source_uri')
        rid = ent.get('@rid')
        
        if not old_uri:
            continue
            
        new_uri = old_uri
        if old_uri.startswith("SOURCE_PATH: "):
            new_uri = old_uri.replace("SOURCE_PATH: ", "").strip()
        elif old_uri.startswith("SOURCE_URL: "):
            new_uri = old_uri.replace("SOURCE_URL: ", "").strip()
            
        if new_uri != old_uri:
            print(f"Updating {cls} {rid}: '{old_uri}' -> '{new_uri}'")
            arcadedb.command(f"UPDATE {rid} SET source_uri = :new_uri", params={"new_uri": new_uri})
            update_count += 1

print(f"Finished. Updated {update_count} entities.")
