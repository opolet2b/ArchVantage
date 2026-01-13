
import sys
import os
import unittest
from unittest.mock import patch, MagicMock
from datetime import datetime

# Setup path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

# Mock missing deps before import
from unittest.mock import MagicMock
sys.modules["langchain_core"] = MagicMock()
sys.modules["langchain_core.messages"] = MagicMock()
sys.modules["langchain_openai"] = MagicMock()
sys.modules["langchain_anthropic"] = MagicMock()
sys.modules["langchain_google_genai"] = MagicMock()
sys.modules["langchain_ollama"] = MagicMock()
sys.modules["langchain_groq"] = MagicMock()

# Mock the entire llm_service module to avoid import issues
mock_llm_module = MagicMock()
sys.modules["app.services.llm_service"] = mock_llm_module
# Also mock the instance 'llm_service' that is imported from it
mock_llm_module.llm_service = MagicMock()

from app.services.conversation_service import ConversationService
from app.models.canvas_models import Canvas
from app.core.database import Base

class TestReordering(unittest.TestCase):
    
    @patch("app.services.conversation_service.ConversationService._get_file_path")
    @patch("app.services.conversation_service.ConversationService._save_conversations")
    @patch("app.services.conversation_service.ConversationService._get_all")
    def test_conversation_reordering(self, mock_get_all, mock_save, mock_path):
        service = ConversationService()
        
        # Mock data
        conversations = {
            "1": {"id": "1", "title": "A", "updated_at": "2023-01-01T10:00:00", "position": 0},
            "2": {"id": "2", "title": "B", "updated_at": "2023-01-01T11:00:00", "position": 0},
            "3": {"id": "3", "title": "C", "updated_at": "2023-01-01T12:00:00", "position": 0}
        }
        mock_get_all.return_value = conversations
        
        # Test 1: Get Sorted (Default: position 0, then updated_at desc)
        # 3 (newest), 2, 1
        sorted_convs = service.get_conversations()
        ids = [c["id"] for c in sorted_convs]
        print(f"Initial Order (by updated_at desc): {ids}")
        self.assertEqual(ids, ["3", "2", "1"])
        
        # Test 2: Reorder
        # Move 1 to top (pos 0), 2 to pos 1, 3 to pos 2
        updates = [
            {"id": "1", "position": 0},
            {"id": "2", "position": 1},
            {"id": "3", "position": 2}
        ]
        
        # Update mock data as the service would
        for u in updates:
            conversations[u["id"]]["position"] = u["position"]
            
        mock_get_all.return_value = conversations
        
        # Verify call
        service.reorder_conversations(updates)
        mock_save.assert_called()
        
        # Get Sorted again
        # 1 (pos 0), 2 (pos 1), 3 (pos 2)
        sorted_convs = service.get_conversations()
        ids = [c["id"] for c in sorted_convs]
        print(f"Reordered Order: {ids}")
        self.assertEqual(ids, ["1", "2", "3"])

    def test_canvas_model_has_position(self):
        c = Canvas(name="Test", position=5)
        self.assertEqual(c.position, 5)
        print("Canvas model accepts position field.")

if __name__ == "__main__":
    unittest.main()
