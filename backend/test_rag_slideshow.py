# from llama_index.core import Document, VectorStoreIndex
# Mock dependencies since they are missing in this env
class Document:
    def __init__(self, text, metadata=None):
        self.text = text
        self.metadata = metadata or {}

class VectorStoreIndex:
    def insert(self, doc):
        pass

class StorageContext:
    pass

from app.services.rag.slideshow_ingestor import SlideshowIngestor

# Mock the ingestor import to use our local mock if needed, 
# but we want to test the actual logic. 
# The actual file imports llama_index.core.Document etc.
# So we need to patch sys.modules or similar if we want to run the ACTUAL code without the lib.
# Actually, since the actual code imports them at top level, it will fail on import.
# We need to test the logic by copying it or mocking the import BEFORE importing the module.

import sys
from unittest.mock import MagicMock

# Mock llama_index before importing ingestion service
sys.modules["llama_index"] = MagicMock()
sys.modules["llama_index.core"] = MagicMock()
sys.modules["llama_index.core"].Document = Document
sys.modules["llama_index.core"].VectorStoreIndex = VectorStoreIndex
sys.modules["llama_index.core"].StorageContext = StorageContext

# Now import
from app.services.rag.slideshow_ingestor import slideshow_ingestor

# Mock Index to capture inserted documents
class MockIndex:
    def __init__(self):
        self.docs = []
    
    def insert(self, doc):
        self.docs.append(doc)

def test_slideshow_ingestor():
    print("Testing Slideshow Ingestor...")
    
    # Create a dummy JSON sidecar
    dummy_json = {
        "slides": [
            {
                "slide_number": 1,
                "elements": [
                    {
                        "text": "Project Title",
                        "type": "TEXT",
                        "x": 0.1, "y": 0.1, "w": 0.8, "h": 0.2
                    },
                    {
                        "type": "SHAPE",
                        "shape_kind": "RECTANGLE",
                        "fill_color": "FF0000",
                        "x": 0.5, "y": 0.5, "w": 0.1, "h": 0.1,
                        "text": ""
                    },
                    {
                        "text": "Bullet Point 1",
                        "type": "TEXT",
                        "x": 0.1, "y": 0.4, "w": 0.4, "h": 0.1
                    }
                ]
            }
        ]
    }
    
    file_path = "test_slide.pptx"
    json_path = f"{file_path}.json"
    
    with open(json_path, "w") as f:
        json.dump(dummy_json, f)
        
    mock_index = MockIndex()
    
    try:
        result = slideshow_ingestor.ingest_slideshow(
            file_path=file_path,
            index=mock_index,
            storage_context=None
        )
        
        print(f"Result: {result}")
        if result["status"] == "success":
            doc_text = mock_index.docs[0].text
            print("\n--- Generated Document Text ---")
            print(doc_text)
            print("-------------------------------")
            
            # Assertions
            assert "Slide 1 (Layout: x,y,w,h normalized 0.0-1.0)" in doc_text
            assert "Project Title" in doc_text
            assert "Bullet Point 1" in doc_text
            assert "x=0.10" in doc_text
            assert "RECTANGLE" in doc_text
            assert "FF0000" in doc_text
            print("\n✅ Verification SUCCESS: Spatial data and colors are present.")
        else:
            print("\n❌ Verification FAILED: Ingestion returned error.")

    finally:
        if os.path.exists(json_path):
            os.remove(json_path)

if __name__ == "__main__":
    test_slideshow_ingestor()
