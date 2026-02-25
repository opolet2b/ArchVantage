
import sys
import os
from pathlib import Path

# Setup paths
backend_path = Path("backend").resolve()
sys.path.append(str(backend_path))
sys.path.append(str(backend_path / "app"))

from app.utils.pdf_generator import PDFGenerator
from reportlab.platypus import SimpleDocTemplate
from reportlab.lib.pagesizes import A4

def test_multi_page_refined_content():
    print("--- Testing Multi-Page Refined Content ---")
    
    # Mock 'refined' content (Phase 2)
    # Long content to force page breaks
    lorem = "This is a very long paragraph of refined content that should appear in the final PDF. " * 50
    content = f"""# Refined Multi-Page Report
    
## Introduction
{lorem}

## Section 1: Detailed Analysis
{lorem}

## Section 2: Further Findings
{lorem}

## Table Data
| Category | Value | Status |
| :--- | :--- | :--- |
| Refinement Cycle | 2 | Completed |
| Priority | High | Correct |
| Page Count | Multi | Verified |

## Conclusion
{lorem}
"""

    output_file = "test_refined_multipage.pdf"
    generator = PDFGenerator()
    generator.parse_markdown(content)
    
    print(f"Building PDF with {len(generator.story)} flowables...")
    doc = SimpleDocTemplate(output_file, pagesize=A4)
    doc.build(generator.story)
    
    if os.path.exists(output_file):
        size = os.path.getsize(output_file)
        print(f"SUCCESS: PDF generated: {output_file} ({size} bytes)")
        if size > 5000:
            print("PDF size suggests multi-page/dense content.")
    else:
        print("FAILED: PDF not generated.")

if __name__ == "__main__":
    test_multi_page_refined_content()
