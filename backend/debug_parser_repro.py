import re

class TemplateParser:
    def parse(self, markdown_content: str):
        lines = markdown_content.split('\n')
        instruction_regex = re.compile(r'<!--\s*INSTRUCTIONS?:\s*(.*?)\s*-->', re.IGNORECASE)
        
        found = []
        for line in lines:
            match = instruction_regex.search(line)
            if match:
                found.append(match.group(1).strip())
        return found

# Test Case 1: Single Line (Should Pass)
test_single = """
## Section 1
<!-- INSTRUCTION: Do this. -->
"""

# Test Case 2: Multi Line (Expected Failure)
test_multi = """
## Section 2
<!-- INSTRUCTION: 
Do this crazy thing
spanning multiple lines. 
-->
"""

parser = TemplateParser()
print(f"Single Line Result: {parser.parse(test_single)}")
print(f"Multi  Line Result: {parser.parse(test_multi)}")
