
import sys
import os

# Set up backend path
sys.path.append(os.path.join(os.getcwd(), "backend"))

from app.services.rag_service import rag_service

FILE_PATH = r"c:\Users\opole\Downloads\ChatBotn\backend\data\uploads\a55710a0-e0e7-4a47-90c9-ce3dd6c857f3\factsheet-d.pdf"
CONVERSATION_ID = "a55710a0-e0e7-4a47-90c9-ce3dd6c857f3"

print(f"Forcing ingestion for: {FILE_PATH}")
res = rag_service.ingest_file(FILE_PATH, conversation_id=CONVERSATION_ID)
print(f"Ingestion Result: {res}")

print("\n--- Verifying Search ---")
results = rag_service.search("factsheet", conversation_id=CONVERSATION_ID, k=3)
print(f"Found {len(results)} results")
for r in results:
    print(f" - {r['text'][:50]}...")
