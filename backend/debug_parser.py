import sys
import os

# Add backend to path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.services.template_parser import TemplateParser, TemplateSection

markdown_sample = """
# Section 1: Introduction

Some content here.

<!-- INSTRUCTION: Ensure tone is professional -->

<!-- BEGIN LOOP: key_findings -->
    <!-- INSTRUCTION: List the key finding in bold -->
    Content inside loop.
<!-- END LOOP -->

<!-- IF: critical_issues -->
    <!-- INSTRUCTION: Highlight critical issues in red -->
    Warning text.
<!-- ENDIF -->
"""

parser = TemplateParser()
blueprint = parser.parse(markdown_sample)

print(f"Sections found: {len(blueprint.sections)}")
for sec in blueprint.sections:
    print(f"Section: {sec.title}")
    print(f"Direct Instructions ({len(sec.instructions)}):")
    for instr in sec.instructions:
        print(f" - {instr.text}")

    # Check validity
    expected_count = 3 
    if len(sec.instructions) != expected_count:
        print(f"FAIL: Expected {expected_count} instructions, found {len(sec.instructions)}")
    else:
        print("PASS: Instruction aggregation working.")
