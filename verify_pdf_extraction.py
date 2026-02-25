
import sys
import os
from pathlib import Path

# Add backend to path
sys.path.append(str(Path(__file__).parent / "backend"))

def test_history_extraction_logic():
    """
    Simulates the logic added to SmartTemplateService to ensure it picks the 
    correct text even if the last node is binary.
    """
    print("=== Testing PDF History Extraction Logic ===")
    
    # Mock Helper
    def get_valid_text(val):
        if val and isinstance(val, str) and len(val) > 0 and not val.strip().startswith("%PDF"):
            return val
        return None

    # Scenario: 4 Steps (Extractor, Analyzer, Visualizer, Formatter)
    # The Formatter is the last node and its output is a PDF path (binary).
    
    history = [
        {"node": "extractor_1", "label": "Extract", "output": {"text": "Raw Source Text"}},
        {"node": "analyzer_1", "label": "Analyze", "output": {"generated_markdown": "#### Refined AI Analysis\nThis is the content we want."}},
        {"node": "visualizer_1", "label": "Visualize", "output": {"generated_markdown": "#### Refined AI Analysis\nThis is the content we want."}},
        {"node": "formatter_1", "label": "Format PDF", "output": {"output_path": "report.pdf", "converted_document": "%PDF-1.4..."}} 
    ]
    
    current_output = history[-1]["output"]
    thing_content = {"text_content": "Raw Source Text"} # The source data fallback
    
    # --- LOGIC START ---
    raw_text = None
    source_key = "None"
    
    # 1. Scan history backwards (THE FIX)
    if not raw_text and history:
        for step in reversed(history):
            node_out = step.get("output", {})
            if not isinstance(node_out, dict): continue
            
            candidate = (
                get_valid_text(node_out.get("generated_markdown")) or 
                get_valid_text(node_out.get("text")) or
                get_valid_text(node_out.get("input_content")) or
                get_valid_text(node_out.get("formatted_output")) or
                get_valid_text(node_out.get("converted_document"))
            )
            if candidate:
                raw_text = candidate
                source_key = f"history_step.{step.get('node')} ({step.get('label')})"
                break

    # 4. Final Fallback (The old logic that used to win)
    if not raw_text:
        raw_text = get_valid_text(thing_content.get("text_content"))
        if raw_text: source_key = "thing_content.text_content (SOURCE FALLBACK)"
    # --- LOGIC END ---

    print(f"Resulting Source Key: {source_key}")
    print(f"Content Length: {len(raw_text) if raw_text else 0}")
    
    expected_key = "history_step.visualizer_1 (Visualize)"
    if source_key == expected_key:
        print("SUCCESS: Correctly prioritized Visualizer output over Source fallback.")
    else:
        print(f"FAILURE: Expected {expected_key}, but got {source_key}")

if __name__ == "__main__":
    test_history_extraction_logic()
