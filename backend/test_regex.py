import re

test_string = """
## Markdown Template
Here is some text.
<!-- INSTRUCTION [ASSIGN: diff_data]: Compare the supplied documents and produce a JSON object with
an items array. Each item must contain the following fields:
lissue_id (unique identifier)
ldescription (brief summary of the difference)
llocation_doc_a (section/page/paragraph in Document A)
llocation_doc_b (section/page/paragraph in Document B)
ldiff_detail (exact textual or structural difference)
lseverity (Low, Medium, High, Critical)
lsuggested_improvement (actionable recommendation to resolve the issue)
Return the JSON in the format: { "items": [ { ... }, { ... } ] }. -->
End text.
"""

assign_pattern = re.compile(r'<!--\s*INSTRUCTIONS?(?:\s*\[ASSIGN:\s*([^\]]+)\])?:\s*(.*?)-->', re.DOTALL | re.IGNORECASE)

matches = list(assign_pattern.finditer(test_string))
print(f"Found {len(matches)} matches.")
for match in matches:
    print(f"ASSIGN_TO: {match.group(1)}")
    print(f"INSTRUCTION: {match.group(2)[:50]}...")
