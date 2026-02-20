
import sys
import os
from pathlib import Path

# Add backend to path
sys.path.append(str(Path(__file__).parent / "backend"))

from app.utils.pdf_generator import convert_markdown_to_pdf

sample_md = """# Test Report
This is a test with unmatched **bold tags.
And a raw <unmatched> tag that wasn't escaped.
Also some & ampersands that might be double escaped.
"""

output_path = "test_repro.pdf"
try:
    print(f"Generating PDF to {output_path}...")
    convert_markdown_to_pdf(sample_md, output_path)
    print("Generation complete.")
    
    if os.path.exists(output_path):
        size = os.path.getsize(output_path)
        print(f"File size: {size} bytes")
        with open(output_path, "rb") as f:
            header = f.read(5)
            print(f"File header: {header}")
            if header.startswith(b"%PDF"):
                print("Valid PDF header found.")
            else:
                print("INVALID PDF HEADER!")
    else:
        print("File NOT created!")
except Exception as e:
    print(f"ERROR: {e}")
