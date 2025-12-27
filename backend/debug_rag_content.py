import sys
import os

# Add current directory to path so we can import app
current_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.append(current_dir)

try:
    print("Importing RAG Service...")
    from app.services.rag_service import rag_service
    
    target_asset = "802458c5-9864-409e-8ed8-5cad9c07bf6a"
    print(f"Testing Search for Asset: {target_asset}")
    
    # 1. Initialize (happens on import/init)
    
    # 2. Search
    query = "Summarize this presentation"
    filters = {"asset_id": target_asset}
    
    print(f"Executing search(query='{query}', filters={filters})...")
    results = rag_service.search(query, k=5, filters=filters)
    
    print(f"Results Found: {len(results)}")
    for i, res in enumerate(results):
        print(f"--- Result {i+1} (Score: {res.get('score', 'N/A')}) ---")
        print(res.get('text')[:200] + "...")
        print(res.get('metadata'))

except Exception as e:
    print(f"Search Failed: {e}")
    import traceback
    traceback.print_exc()
