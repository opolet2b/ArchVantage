import chromadb
client = chromadb.PersistentClient(path='./chroma_db')
collection = client.get_collection('chatbot_rag_v2')
results = collection.get(where={'thing_id': '6b243090-4d96-4a35-b7e1-86b56d454e67'})
print(f"Count for thing_id: {len(results['ids'])}")
if len(results['ids']) > 0:
    print(f"Metadata sample: {results['metadatas'][0]}")
else:
    all_docs = collection.get(limit=1)
    print(f"Collection total docs: {collection.count()}")
    if all_docs['metadatas']:
        print(f"Random metadata sample: {all_docs['metadatas'][0]}")
