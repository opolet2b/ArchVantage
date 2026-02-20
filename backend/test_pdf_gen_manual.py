from app.utils.pdf_generator import convert_markdown_to_pdf
import os

sample_markdown = """
# Smart Analysis Report

## Executive Summary
This is a **bold** statement about the analysis. We found several key insights:

- Market trends are *upward*.
- User engagement is increasing.
- Costs are stabilizing.

## Technical Details

The system uses the following configuration:

```
{
  "model": "gpt-4",
  "temperature": 0.7
}
```

### Conclusion
Overall, the strategy is sound.
"""

output_file = "test_report.pdf"

try:
    print(f"Generating PDF to {output_file}...")
    convert_markdown_to_pdf(sample_markdown, output_file)
    print("PDF generation successful!")
    print(f"File exists: {os.path.exists(output_file)}")
    print(f"File size: {os.path.getsize(output_file)} bytes")
except Exception as e:
    print(f"PDF generation failed: {e}")
