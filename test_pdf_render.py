
import os
from app.utils.pdf_generator import convert_markdown_to_pdf

markdown_content = """
# Test Report

## Missing Text Investigation
This is a paragraph that spans
multiple lines in markdown. It should
be rendered as a single paragraph in the PDF.

## Table Formatting Issue
| Column A | Column B | Column C |
|----------|----------|----------|
| Row 1, Col A | Row 1, Col B | Row 1, Col C |
| Row 2, Col A | Row 2, Col B | Row 2, Col C |

### Another Header
* List item 1
* List item 2
  * Nested list item (might be missing?)

Final paragraph with some **bold** and `code` symbols.
"""

output_path = "debug_output.pdf"
result = convert_markdown_to_pdf(markdown_content, output_path)
print(f"PDF generated at: {os.path.abspath(result)}")
