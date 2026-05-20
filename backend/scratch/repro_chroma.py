import chromadb
import os

persist_directory = r"c:\Users\opole\Downloads\ChatBotn\backend\chroma_db"

print(f"Attempting to initialize ChromaDB PersistentClient at {persist_directory}")
try:
    client = chromadb.PersistentClient(path=persist_directory)
    print("Successfully initialized ChromaDB Client")
    print(f"Collections: {client.list_collections()}")
except Exception as e:
    print(f"FAILED: {e}")
