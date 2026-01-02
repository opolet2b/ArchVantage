import asyncio
import sys
from unittest.mock import MagicMock, AsyncMock, patch

# Ensure imports work
sys.path.append("C:/Users/opole/Downloads/ChatBotn/backend")

# Mock dependencies
sys.modules["langchain_openai"] = MagicMock()
sys.modules["langchain_community"] = MagicMock()
sys.modules["langchain_anthropic"] = MagicMock()
sys.modules["langchain_google_genai"] = MagicMock()
sys.modules["llama_index"] = MagicMock()
sys.modules["chromadb"] = MagicMock()

# Mock rag_service BEFORE importing smart_template_service
mock_rag = MagicMock()
mock_rag.search = MagicMock(return_value=[
    {"text": "Chunk 1 Content"}, 
    {"text": "Chunk 2 Content"}
])
sys.modules["app.services.rag_service"] = MagicMock()
sys.modules["app.services.rag_service"].rag_service = mock_rag

from app.models.canvas_models import CanvasThing, ThingType
from app.services.smart_template_service import smart_template_service

async def run_test():
    print("--- Starting RAG Resolution Verification ---")
    
    # Mock Document Thing
    doc_thing = MagicMock(spec=CanvasThing)
    doc_thing.id = "doc-123"
    doc_thing.type = MagicMock()
    doc_thing.type.value = "document"
    doc_thing.title = "Test PDF"
    doc_thing.content = {"filename": "test.pdf"}
    
    print("\nTest Case 1: Document Resolution via RAG")
    content = await smart_template_service._resolve_thing_content(doc_thing)
    
    print(f"Resolved Content Length: {len(content)}")
    print(f"Resolved Content Preview: {content[:100]}...")
    
    if "Chunk 1 Content" in content and "Chunk 2 Content" in content:
        print("SUCCESS: RAG content retrieved.")
    else:
        print("FAILURE: Content mismatch.")

    # Verify RAG call
    mock_rag.search.assert_called()
    call_args = mock_rag.search.call_args
    print(f"RAG Search called with: {call_args}")
    
    # Test Case 2: Fallback (No RAG results)
    print("\nTest Case 2: RAG Fallback")
    mock_rag.search.return_value = []
    doc_thing.content = {"filename": "test.pdf", "description": "Fallback Summary"}
    
    content_fallback = await smart_template_service._resolve_thing_content(doc_thing)
    print(f"Fallback Content: {content_fallback}")
    
    if content_fallback == "Fallback Summary":
        print("SUCCESS: Fallback used.")
    else:
        print(f"FAILURE: Fallback mismatch. Got: {content_fallback}")

    print("\n--- Verification Complete ---")

if __name__ == "__main__":
    asyncio.run(run_test())
