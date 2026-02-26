import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.core.arcadedb import arcadedb

def check(query_text, label):
    print(f"--- {label} ---")
    try:
        res = arcadedb.query(query_text).get("result", [])
        print(f"Count: {len(res)}")
        if res:
            print(f"First 2 results: {res[:2]}")
    except Exception as e:
        print(f"Error: {e}")

check("SELECT count(*) FROM Entity", "Count Entities")
check("SELECT FROM Entity LIMIT 5", "Sample Entities")
check("SELECT count(*) FROM KNOWLEDGE_LINK", "Count Edges")
check("SELECT FROM KNOWLEDGE_LINK LIMIT 5", "Sample Edges")
