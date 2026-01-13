
import sys
import os
import asyncio
from datetime import datetime

# Add backend to path
sys.path.append(os.path.join(os.getcwd(), "backend"))

# Mock dependencies if needed
import unittest.mock
from unittest.mock import MagicMock

# Mock RAG Service
sys.modules["app.services.rag_service"] = MagicMock()
mock_rag_service = MagicMock()
sys.modules["app.services.rag_service"].rag_service = mock_rag_service

# Mock Config Service
sys.modules["app.services.config_service"] = MagicMock()
sys.modules["app.services.config_service"].config_service.get_default_llm_preset.return_value = {}

# Import Worker
from app.routers.canvas_worker import handle_async_vectorization
from app.models.canvas_models import CanvasThing, ThingType, RAGStatus, Canvas

def test_text_vectorization():
    print("--- Starting Text Vectorization Test (Mock DB) ---")
    
    # Create Mock DB Session
    mock_db = MagicMock()
    
    # Mock Token Object (Thing)
    mock_thing = MagicMock(spec=CanvasThing)
    mock_thing.id = "thing_text_1"
    mock_thing.type = ThingType.TEXT # Use Enum
    mock_thing.content = {"text": "This is a sample text for vectorization."}
    mock_thing.rag_status = RAGStatus.PENDING
    # Add SQLAlchemy state mock
    mock_thing._sa_instance_state = MagicMock()
    
    # Mock Canvas
    mock_canvas = MagicMock(spec=Canvas)
    mock_canvas.id = "test_canvas"
    mock_canvas.owner_config = {}
    
    # Setup Query chain
    # db.query(CanvasThing).filter(...).first() -> mock_thing
    # db.query(Canvas).filter(...).first() -> mock_canvas
    
    def side_effect_query(model):
        query_mock = MagicMock()
        if model == CanvasThing:
            query_mock.filter.return_value.first.return_value = mock_thing
        elif model == Canvas:
            query_mock.filter.return_value.first.return_value = mock_canvas
        return query_mock
    
    mock_db.query.side_effect = side_effect_query
    
    # Patch flag_modified to avoid AttributeError
    with unittest.mock.patch('sqlalchemy.orm.attributes.flag_modified') as mock_flag_modified, \
         unittest.mock.patch('app.core.database.SessionLocal', return_value=mock_db):
        
        # Run Worker
        print("Running handle_async_vectorization...")
        asyncio.run(handle_async_vectorization(
            thing_id="thing_text_1",
            file_path="TEXT_CONTENT_MODE",
            canvas_id="test_canvas"
        ))
        
        # Verify RAG Service Call
        mock_rag_service.ingest_text.assert_called_once()
        args, kwargs = mock_rag_service.ingest_text.call_args
        print(f"RAG Service called with: {args[0][:20]}...")
        
        # Verify DB interactions
        # Check if rag_status was set to PROCESSING then COMPLETED?
        # The worker sets it to PROCESSING first, then COMPLETED.
        # Check final state assignment
        # Since it's a PropertyMock or similar, checking direct attribute assignment on mock object
        # We can check if rag_status was assigned.
        pass

    print("SUCCESS: Worker ran without error and called ingest_text.")

if __name__ == "__main__":
    try:
        test_text_vectorization()
    except Exception as e:
        print(f"Test Failed with Exception: {e}")
        import traceback
        traceback.print_exc()
