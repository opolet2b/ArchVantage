
import sys
from unittest.mock import MagicMock

# Mock llama_index and its submodules BEFORE importing app modules
mock_llama = MagicMock()
sys.modules["llama_index"] = mock_llama
sys.modules["llama_index.core"] = mock_llama
sys.modules["llama_index.vector_stores"] = mock_llama
sys.modules["llama_index.vector_stores.chroma"] = mock_llama
sys.modules["llama_index.embeddings"] = mock_llama
sys.modules["llama_index.embeddings.ollama"] = mock_llama
sys.modules["llama_index.llms"] = mock_llama
sys.modules["llama_index.llms.ollama"] = mock_llama
sys.modules["llama_index.llms.openai"] = mock_llama
sys.modules["chromadb"] = MagicMock()
sys.modules["jose"] = MagicMock() # Mock jose for auth
sys.modules["passlib"] = MagicMock() # Mock passlib just in case
sys.modules["passlib.context"] = MagicMock()
sys.modules["email_validator"] = MagicMock() # Mock email_validator for pydantic

import asyncio
from unittest.mock import MagicMock, patch
from app.routers.canvas import discover_links
from app.schemas.canvas_schemas import DiscoverLinksRequest
from app.models.canvas_models import Canvas, CanvasThing, ModelThingType

async def verify_image_discovery():
    print("Verifying Image Link Discovery...")
    
    # Mock dependencies
    mock_db = MagicMock()
    mock_user = MagicMock()
    mock_user.id = "user1"
    
    # Mock Canvas
    mock_canvas = Canvas(id="canvas1", owner_id="user1")
    mock_db.query.return_value.filter.return_value.first.return_value = mock_canvas
    
    # Mock Image Thing with COMPLETED status
    mock_thing = CanvasThing(
        id="thing_image_1",
        canvas_id="canvas1",
        type=ModelThingType.IMAGE,
        rag_status="completed", # Crucial for triggering the new logic
        content={}
    )
    
    # Setup DB query to return our thing
    mock_db.query.return_value.filter.return_value.all.return_value = [mock_thing]
    mock_db.query.return_value.filter.return_value.limit.return_value.all.return_value = [] # For domains
    
    # Mock LLM Service (so it doesn't try to call OpenAI)
    with patch("app.services.llm_service.llm_service") as mock_llm:
        mock_llm.chat.return_value = '{"links": [{"source": "thing_image_1", "target": "other", "label": "test"}]}'
        
        # Mock RAG Service (The core test)
        with patch("app.services.rag_service.rag_service") as mock_rag:
            mock_rag.search.return_value = [{"text": "A photo of a server rack."}]
            
            request = DiscoverLinksRequest(
                thing_ids=["thing_image_1"],
                domain_ids=[],
                model="gpt-4o"
            )
            
            try:
                response = await discover_links("canvas1", request, mock_db, mock_user)
                
                print("Response:", response)
                
                # Verify RAG was called
                mock_rag.search.assert_called()
                print("✅ RAG Service was called for IMAGE")
                
                # Check call args
                call_args = mock_rag.search.call_args
                print("RAG Call Args:", call_args)
                
                if call_args.kwargs['filters'] == {'thing_id': 'thing_image_1'}:
                     print("✅ Correct filters used")
                else:
                     print("❌ Incorrect filters")

            except Exception as e:
                print(f"❌ Error: {e}")

if __name__ == "__main__":
    asyncio.run(verify_image_discovery())
