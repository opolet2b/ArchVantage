import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.core.database import SessionLocal
from app.routers.knowledge import get_kb_graph

try:
    kb_id = "562bf03d-f18e-4419-95c4-760709105cc0"
    db = SessionLocal()
    res = get_kb_graph(kb_id, db)
    elements = res.get("elements", [])
    print(f"Total elements returned by router: {len(elements)}")
    if elements:
        print(f"Sample: {elements[0]}")
except Exception as e:
    import traceback
    traceback.print_exc()
finally:
    db.close()
