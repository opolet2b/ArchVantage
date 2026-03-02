from app.core.arcadedb import arcadedb
res = arcadedb.query("SELECT name, @type, source_uri FROM Entity WHERE graph_id = '562bf03d-f18e-4419-95c4-760709105cc0' LIMIT 500").get("result", [])
with open("source_uris.txt", "w", encoding="utf-8") as f:
    f.write(f"Total nodes: {len(res)}\n")
    for r in res:
        f.write(f"{r.get('name')} | {r.get('source_uri')}\n")
