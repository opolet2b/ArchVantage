
def get_valid_text(val):
    if val and isinstance(val, str) and len(val) > 0:
        return val
    return None

def extract_content(thing_content, current_output):
    raw_text = None
    source_key = "None"

    # 1. Check thing_content direct text
    if not raw_text:
        raw_text = get_valid_text(thing_content.get("text_content"))
        if raw_text: source_key = "thing_content.text_content"

    # 2. Check current_output (Standard Keys)
    if not raw_text and isinstance(current_output, dict):
        raw_text = get_valid_text(current_output.get("converted_document"))
        if raw_text: source_key = "current_output.converted_document"
    
    if not raw_text and isinstance(current_output, dict):
        raw_text = get_valid_text(current_output.get("formatted_output"))
        if raw_text: source_key = "current_output.formatted_output"

    if not raw_text and isinstance(current_output, dict):
        raw_text = get_valid_text(current_output.get("generated_markdown"))
        if raw_text: source_key = "current_output.generated_markdown"

    if not raw_text and isinstance(current_output, dict):
        raw_text = get_valid_text(current_output.get("text"))
        if raw_text: source_key = "current_output.text"
        
    if not raw_text and isinstance(current_output, dict):
        # Handle nested analysis results
        res = current_output.get("analysis_results")
        if isinstance(res, dict):
            raw_text = get_valid_text(res.get("formatted_output"))
            if raw_text: source_key = "current_output.analysis_results.formatted_output"

    return raw_text, source_key

# Test Cases
print("Running PDF Extraction Tests...")

# Case 1: Direct Text
t1 = {"text_content": "Direct Content"}
o1 = {}
r1, s1 = extract_content(t1, o1)
print(f"Case 1 (Direct): {r1 == 'Direct Content'} ({s1})")

# Case 2: Converted Document
t2 = {}
o2 = {"converted_document": "Converted Content"}
r2, s2 = extract_content(t2, o2)
print(f"Case 2 (Converted): {r2 == 'Converted Content'} ({s2})")

# Case 3: Formatted Output
t3 = {}
o3 = {"formatted_output": "Formatted Content"}
r3, s3 = extract_content(t3, o3)
print(f"Case 3 (Formatted): {r3 == 'Formatted Content'} ({s3})")

# Case 4: Generated Markdown
t4 = {}
o4 = {"generated_markdown": "Markdown Content"}
r4, s4 = extract_content(t4, o4)
print(f"Case 4 (Markdown): {r4 == 'Markdown Content'} ({s4})")

# Case 5: Nested Analysis
t5 = {}
o5 = {"analysis_results": {"formatted_output": "Nested Content"}}
r5, s5 = extract_content(t5, o5)
print(f"Case 5 (Nested): {r5 == 'Nested Content'} ({s5})")

# Case 6: Fallback (None)
t6 = {}
o6 = {"some_random_key": "garbage"}
r6, s6 = extract_content(t6, o6)
print(f"Case 6 (Fallback): {r6 is None} ({s6})")

# Case 7: Priority (Direct over Converted)
t7 = {"text_content": "Priority Content"}
o7 = {"converted_document": "Secondary Content"}
r7, s7 = extract_content(t7, o7)
print(f"Case 7 (Priority): {r7 == 'Priority Content'} ({s7})")
