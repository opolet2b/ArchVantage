
import requests
import json
import sys

# Testing the "Generic Sidebar Chat" fallback logic
# ID of the conversation where the user uploaded the file
# We don't have the user's ID here, but I'll use the one from the screenshot or previous context if available.
# Actually, the user's error earlier showed: 41f853ad-9d33-4eff-8d12-cb2f0de5caf6
CONVERSATION_ID = "41f853ad-9d33-4eff-8d12-cb2f0de5caf6"

# Token is needed now. I'll read it from the environment or just assuming I can bypass auth locally? 
# No, I can't bypass auth if I call the API.
# So I will test the RAG service directly instead of the API, to avoid needing a valid user token.

import sys
import os

# Set up backend path
sys.path.append(os.path.join(os.getcwd(), "backend"))

from app.services.rag_service import rag_service

print(f"Checking RAG for Conversation ID: {CONVERSATION_ID}")

# 1. Search directly
print("\n--- Direct Search ---")
results = rag_service.search("test query", conversation_id=CONVERSATION_ID, k=3)
print(f"Found {len(results)} results")
for r in results:
    print(f" - {r['text'][:50]}... (Meta: {r['metadata']})")

# 2. List documents (verify ingestion happened)
print("\n--- Document List ---")
docs = rag_service.list_documents(CONVERSATION_ID)
print(f"Documents in storage: {docs}")
