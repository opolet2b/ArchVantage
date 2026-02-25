import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.core.arcadedb import arcadedb

kb_id = '562bf03d-f18e-4419-95c4-760709105cc0'

print("--- Checking Entity ---")
try:
    res = arcadedb.query(f"SELECT count(*) FROM Entity").get("result", [])
    print(f"Total Entities across all DB: {res}")
    
    res = arcadedb.query(f"SELECT FROM Entity LIMIT 1").get("result", [])
    print(f"Sample: {res}")
except Exception as e:
    print(f"Error Entity: {e}")

print("--- Checking KNOWLEDGE_LINK ---")
try:
    res = arcadedb.query(f"SELECT count(*) FROM KNOWLEDGE_LINK").get("result", [])
    print(f"Total Edges across all DB: {res}")
    
    res = arcadedb.query(f"SELECT FROM KNOWLEDGE_LINK LIMIT 1").get("result", [])
    print(f"Sample Edge: {res}")
except Exception as e:
    print(f"Error Edge: {e}")
