import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.core.arcadedb import arcadedb

try:
    print("Dropping indices...")
    arcadedb.command("DROP INDEX `KNOWLEDGE_LINK[relation_type]`", silent=True)
    arcadedb.command("DROP INDEX `KNOWLEDGE_LINK[graph_id]`", silent=True)
    print("Done")
except Exception as e:
    print(e)
