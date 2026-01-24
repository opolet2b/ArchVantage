from app.services.template_parser import template_parser, LoopBlock, ConditionalBlock

markdown = """
# Section 1
<!-- INSTRUCTION: Do something -->

<!-- BEGIN LOOP: Documents -->
<!-- INSTRUCTION: Analyze doc -->
<!-- END LOOP -->

<!-- IF: Data Available -->
<!-- INSTRUCTION: Process data -->
<!-- ELSE -->
<!-- INSTRUCTION: Skip data -->
<!-- ENDIF -->
"""

print("Parsig Markdown...")
blueprint = template_parser.parse(markdown)

print("\nSections Found:", len(blueprint.sections))
for section in blueprint.sections:
    print(f"Section: {section.title}")
    for child in section.children:
        if isinstance(child, LoopBlock):
            print(f"  - Loop over: {child.source}")
        elif isinstance(child, ConditionalBlock):
            print(f"  - IF: {child.condition}")
            print(f"    Then items: {len(child.if_content)}")
            print(f"    Else items: {len(child.else_content)}")
        else:
            print(f"  - Item: {type(child)}")

print("\nValidation Complete.")
