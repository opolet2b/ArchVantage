import sys
import os
import uuid
import datetime
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.core.arcadedb import arcadedb

try:
    kb_id = "562bf03d-f18e-4419-95c4-760709105cc0"
    ent_name = "Isolation Test Node"
    ent_uid = f"ent-{uuid.uuid4().hex[:8]}"
    ent_type = "Service_Provider"
    now_str = datetime.datetime.now().isoformat()
    
    # 1. Create class just in case
    arcadedb.command(f"CREATE VERTEX TYPE `{ent_type}` IF NOT EXISTS EXTENDS Entity", silent=True)
    
    # 2. Insert Node
    query = f"INSERT INTO `{ent_type}` SET uid = :uid, name = :name, summary = 'test', source_uri = 'test', source_type = 'DOCUMENT', graph_id = :graph_id, last_synced = :now, sync_status = 'SYNCED' RETURN @rid"
    res = arcadedb.command(query, params={
        "uid": ent_uid,
        "name": ent_name,
        "graph_id": kb_id,
        "now": now_str
    })
    
    print(f"Insert Response: {res}")
    
    # 3. Read it back
    if res and res.get("result"):
        rid = res["result"][0]["@rid"]
        read_res = arcadedb.query(f"SELECT FROM {rid}")
        print(f"Read Back: {read_res}")
        
    # 4. Count all by graph id
    cnt_res = arcadedb.query(f"SELECT count(*) FROM `{ent_type}` WHERE graph_id = :gid", params={"gid": kb_id})
    print(f"Total Service_Provider nodes for Graph ID {kb_id}: {cnt_res}")

except Exception as e:
    import traceback
    traceback.print_exc()
