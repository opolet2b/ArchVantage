
import json
from jinja2 import Environment, BaseLoader, exceptions as jinja_exceptions
import re

class DocumentTemplateServiceDebug:
    def __init__(self):
        self.jinja_env = Environment(loader=BaseLoader())

    def _interpolate(self, text: str, context: dict) -> str:
        if not text or "{{" not in text:
            return text
            
        # Normalize common typos and syntax variations inside {{ ... }}
        def _normalize_tag(match):
            content = match.group(1)
            # Step A: Remove existing pipe before default if we're going to add it
            content = re.sub(r'\|\s*default', 'default', content)
            # Step B: Normalize 'default: "val"' to '| default("val")'
            content = re.sub(r'default\s*[:(]\s*([^|}]+)', r'| default(\1)', content)
            # Step C: Ensure closing parenthesis
            if 'default(' in content and content.count('(') > content.count(')'):
                content = content.strip() + ')'
            return f"{{{{ {content.strip()} }}}}"

        processed_text = re.sub(r'\{\{(.*?)\}\}', _normalize_tag, text)
        print(f"DEBUG: Original: {text}")
        print(f"DEBUG: Processed: {processed_text}")
        
        try:
            template = self.jinja_env.from_string(processed_text)
            return template.render(**context)
        except Exception as e:
            print(f"DEBUG: Error: {e}")
            return f"[Interpolation Error: {text}]"

# Mock context based on DOC_TEMPLATE_CONTEXT.txt
context = {
    "doc_list": {
        "items": [
            {"title": "Doc A", "version": "1.0"},
            {"title": "Doc B", "version": "2.0"}
        ]
    },
    "diff_data": {
        "total_count": 3,
        "items": []
    }
}

service = DocumentTemplateServiceDebug()

test_strings = [
    "- Total Documents Compared: {{ doc_list.items | length | default: \"N/A\" }}",
    "- Total Difference Items Detected: {{ diff_data.total_count | default: \"N/A\" }}"
]

for s in test_strings:
    result = service._interpolate(s, context)
    print(f"RESULT: {result}")
    print("-" * 20)

# Test dict method conflict
print("Testing dict method conflict:")
dict_test = {"items": [1, 2, 3]}
res = service._interpolate("{{ dict_test.items | length }}", {"dict_test": dict_test})
print(f"RESULT (dict.items | length): {res}")
