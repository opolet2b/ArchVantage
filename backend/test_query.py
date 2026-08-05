import sys
sys.path.append('c:\\Users\\opole\\Downloads\\ChatBotn\\backend')
from app.core.database import SessionLocal
from app.models.knowledge_graph import KnowledgeBaseConfig
from app.core.arcadedb import arcadedb

db = SessionLocal()
kbs = db.query(KnowledgeBaseConfig).all()
for kb in kbs:
    print(f"Testing KB: {kb.id}")
    if kb.ontology_classes:
        for c in kb.ontology_classes:
            cls_name = c.get('name', c) if isinstance(c, dict) else c
            sanitized_cls = cls_name.replace(' ', '_')
            try:
                db_query = f"SELECT FROM `{sanitized_cls}` WHERE graph_id = :gid LIMIT 5"
                res = arcadedb.query(db_query, params={"gid": kb.id}).get("result", [])
                if len(res) > 0:
                    print(f"  Success for {sanitized_cls}: {len(res)} results")
            except Exception as e:
                print(f"  Error for {sanitized_cls}: {e}")
