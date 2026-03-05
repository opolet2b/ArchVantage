import re

template = """<!-- INSTRUCTION [ASSIGN: diff_data]: Compare the supplied documents and produce a JSON object with
an items array. Each item must contain the following fields:
lissue_id (unique identifier)
ldescription (brief summary of the difference)
llocation_doc_a (section/page/paragraph in Document A)
location_doc_b (section/page/paragraph in Document B)
ldiff_detail (exact textual or structural difference)
lseverity (Low, Medium, High, Critical)
lsuggested_improvement (actionable recommendation to resolve the issue)
Return the JSON in the format: { "items": [ { ... }, { ... } ] }. -->"""

assign_pattern = re.compile(r'<!--\s*INSTRUCTIONS?(?:\s*\[ASSIGN:\s*([^\]]+)\])?:\s*(.*?)-->', re.DOTALL | re.IGNORECASE)

matches = list(assign_pattern.finditer(template))
print("MATCHES:", len(matches))
for i, m in enumerate(matches):
    print(f"Match {i+1}:")
    print(f"  Var: {m.group(1)}")
    print(f"  Instruction: {m.group(2)[:50]}...")
