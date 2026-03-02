import sys
import os

# Add backend to path
sys.path.append(os.getcwd())

from app.core.arcadedb import arcadedb

# The specific URL we are tracking
TARGET_URL = "https://www.bk.admin.ch/bk/en/home/digitale-transformation-ikt-lenkung/bundesarchitektur/e-government-architektur.html"
KB_ID = '562bf03d-f18e-4419-95c4-760709105cc0'

print(f"--- Checking ArcadeDB for URL: {TARGET_URL} ---")

try:
    # 1. Check if ANY entities have this URL as their source
    query = "SELECT count(*) as count FROM Entity WHERE source_uri = :url AND graph_id = :kb_id"
    res = arcadedb.query(query, params={"url": TARGET_URL, "kb_id": KB_ID})
    count = res.get('result', [{}])[0].get('count', 0)
    
    print(f"\n1. Total entities found exactly matching this URL: {count}")

    # 2. If found, let's list a few to see what they are
    if count > 0:
        print("\n2. Sample of entities found:")
        sample_query = "SELECT name, @class as class_name FROM Entity WHERE source_uri = :url AND graph_id = :kb_id LIMIT 5"
        sample_res = arcadedb.query(sample_query, params={"url": TARGET_URL, "kb_id": KB_ID})
        for item in sample_res.get('result', []):
            print(f"   - Name: {item.get('name')} | Type: {item.get('class_name')}")
    else:
        # 3. If NOT found, let's check if there are ANY URLs stored at all (maybe it was stored slightly differently)
        print("\n3. No exact matches. Checking if ANY URLs (http...) are stored for this KB:")
        any_url_query = "SELECT source_uri, count(*) as c FROM Entity WHERE source_uri LIKE 'http%' AND graph_id = :kb_id GROUP BY source_uri"
        any_url_res = arcadedb.query(any_url_query, params={"kb_id": KB_ID})
        results = any_url_res.get('result', [])
        
        if results:
            for item in results:
                print(f"   - Found {item.get('c')} entities for: {item.get('source_uri')}")
        else:
            print("   - No entities found with ANY 'http' source_uri in this KB.")

except Exception as e:
    print(f"Error querying ArcadeDB: {e}")
