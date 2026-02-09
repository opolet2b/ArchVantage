import os
import sys

# Add backend to path
sys.path.append(os.path.join(os.getcwd(), "backend"))

import chromadb
from chromadb.config import Settings as ChromaSettings

persist_dir = "./chroma_db"

print(f"Testing ChromaDB initialization at {persist_dir}...")

try:
    client = chromadb.PersistentClient(
        path=persist_dir,
        settings=ChromaSettings(
            chroma_api_impl="chromadb.api.segment.SegmentAPI",
            is_persistent=True,
            persist_directory=persist_dir,
            anonymized_telemetry=False
        )
    )
    print("SUCCESS: ChromaDB Client initialized.")
    
    # Try to connect to a collection or list them
    collections = client.list_collections()
    print(f"Collections found: {len(collections)}")
    for c in collections:
        print(f" - {c.name}")
        
except Exception as e:
    print(f"FAILURE: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)
