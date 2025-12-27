import json
import os
import glob
import sys

# Path to data storage
BASE_DIR = r"c:\Users\opole\Downloads\ChatBotn\backend\data_storage"

def analyze_latest_json():
    print(f"Searching in {BASE_DIR}...")
    
    # Find all json files
    # Note: Recursive glob might be slow, but let's try specific date first
    # Or just walk
    json_files = []
    for root, dirs, files in os.walk(BASE_DIR):
        for file in files:
            if file.endswith(".json"):
                 json_files.append(os.path.join(root, file))
    
    if not json_files:
        print("No JSON files found matching 'Strategie'.")
        return

    # Sort by time
    latest_file = max(json_files, key=os.path.getmtime)
    print(f"Analyzing Latest File: {latest_file}")
    
    try:
        with open(latest_file, "r", encoding="utf-8") as f:
            data = json.load(f)
            
        slides = data.get("slides", [])
        print(f"Total Slides: {len(slides)}")
        
        total_text_chars = 0
        empty_slides = 0
        
        for i, slide in enumerate(slides):
            slide_text = ""
            shapes = slide.get("shapes", [])
            for shape in shapes:
                text = shape.get("text", "").strip()
                if text:
                    slide_text += text + " "
            
            total_text_chars += len(slide_text)
            if not slide_text.strip():
                empty_slides += 1
                if i < 5: # Log first few empty ones
                    print(f"  Slide {i+1}: EMPTY")
            else:
                if i < 3: # Log first few content ones
                    print(f"  Slide {i+1}: Found {len(slide_text)} chars. Start: '{slide_text[:50]}...'")

        print("\n--- ANALYSIS SUMMARY ---")
        print(f"Total Text Length: {total_text_chars} characters")
        print(f"Empty Slides: {empty_slides}/{len(slides)}")
        
        if total_text_chars < 100:
             print("CONCLUSION: EXTRACTION FAILED. JSON contains almost no text.")
        else:
             print("CONCLUSION: EXTRACTION SUCCESS. JSON contains text.")

    except Exception as e:
        print(f"Error parsing JSON: {e}")

if __name__ == "__main__":
    analyze_latest_json()
