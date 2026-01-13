
import unittest
import sys
from unittest.mock import MagicMock, patch

# Mock dependencies that might be missing in test env or cause import errors
sys.modules['app.core.security'] = MagicMock()
sys.modules['app.routers.auth'] = MagicMock()
sys.modules['jose'] = MagicMock()

from app.routers.canvas import trigger_vectorization
from app.models.canvas_models import CanvasThing, ThingType, RAGStatus

class TestManualVectorization(unittest.TestCase):
    def setUp(self):
        self.mock_db = MagicMock()
        self.mock_bg_tasks = MagicMock()
        self.mock_user = MagicMock()
        self.canvas_id = "canvas_123"
        self.thing_id = "thing_123"

    def test_vectorize_text_thing(self):
        # Setup mock thing
        mock_thing = MagicMock(spec=CanvasThing)
        mock_thing.id = self.thing_id
        mock_thing.canvas_id = self.canvas_id
        mock_thing.type = ThingType.TEXT
        mock_thing.content = {"text": "Hello World"}
        mock_thing.rag_status = "none"
        
        # Configure DB query to return this thing
        self.mock_db.query.return_value.filter.return_value.first.return_value = mock_thing
        
        # Call endpoint
        with patch('app.routers.canvas.handle_async_vectorization') as mock_worker:
            response = trigger_vectorization(
                canvas_id=self.canvas_id,
                thing_id=self.thing_id,
                background_tasks=self.mock_bg_tasks,
                db=self.mock_db,
                current_user=self.mock_user
            )
            
            # Assert status updated to PENDING
            self.assertEqual(mock_thing.rag_status, RAGStatus.PENDING)
            
            # Assert DB commit
            self.mock_db.commit.assert_called()
            
            # Assert background task added
            self.mock_bg_tasks.add_task.assert_called()
            
            # Verify correct args passed to background task
            # (task_func, *args)
            call_args = self.mock_bg_tasks.add_task.call_args
            self.assertEqual(call_args[0][0].__name__, 'handle_async_vectorization')
            self.assertEqual(call_args[0][1], self.thing_id)
            self.assertEqual(call_args[0][2], "TEXT_CONTENT_MODE")
            self.assertEqual(call_args[0][3], self.canvas_id)
            
            print("Test passed: Manual vectorization triggered correctly.")

if __name__ == '__main__':
    unittest.main()
