import asyncio
from app.services.template_parser import template_parser
from app.services.document_template_service import DocumentTemplateService

async def run_test():
    markdown = """
# Test Template

<!-- INSTRUCTION [ASSIGN: differences]:
Extract differences from context.
-->

<!-- BEGIN LOOP: differences.items -->
- Diff: {{ loop_item.name }}
<!-- END LOOP -->
    """
    
    print("Parsing...")
    blueprint = template_parser.parse(markdown)
    
    for section in blueprint.sections:
        print(f"Section: {section.title}")
        for i, instr in enumerate(section.instructions):
            print(f"Instr {i}: assign_to={instr.assign_to}, text={instr.text}")
            
    # Mocking execution
    service = DocumentTemplateService()
    print("Mocking successful")

if __name__ == "__main__":
    asyncio.run(run_test())
