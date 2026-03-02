import sys
import os

sys.path.append(os.getcwd())
from app.core.arcadedb import arcadedb

KB_ID = '562bf03d-f18e-4419-95c4-760709105cc0'

# Check all source_uri values in the DB
query = f"SELECT source_uri, count(*) as count FROM Entity WHERE graph_id = '{KB_ID}' GROUP BY source_uri"
res = arcadedb.query(query)

print("--- Source URI Distribution ---")
for r in res.get('result', []):
    uri = str(r.get('source_uri'))
    safe_uri = uri.encode('ascii', 'replace').decode('ascii')
    print(f"'{safe_uri}': {r.get('count')}")

# Get a sample of http sources or SOURCE_URL sources
print("\n--- Sample URL Sources ---")
query2 = f"SELECT name, @class as class_name, source_uri FROM Entity WHERE (source_uri LIKE 'http%' OR source_uri LIKE 'SOURCE_URL%') AND graph_id = '{KB_ID}' LIMIT 10"
res2 = arcadedb.query(query2)
for r in res2.get('result', []):
    safe_name = str(r.get('name')).encode('ascii', 'replace').decode('ascii')
    safe_uri = str(r.get('source_uri')).encode('ascii', 'replace').decode('ascii')
    print(f" - [{r.get('class_name')}] {safe_name} | Source: {safe_uri}")
