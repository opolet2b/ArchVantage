import sys
import os

try:
    from pypdf import PdfReader
except ImportError:
    try:
        import PyPDF2
        from PyPDF2 import PdfReader
    except ImportError:
        print("pypdf not found")
        sys.exit(1)

def extract_text(pdf_path):
    try:
        if not os.path.exists(pdf_path):
            return f"Error: File not found at {pdf_path}"
            
        reader = PdfReader(pdf_path)
        text = ""
        for i, page in enumerate(reader.pages):
            text += f"--- Page {i+1} ---\n"
            text += page.extract_text() + "\n"
        return text
    except Exception as e:
        return f"Error reading {pdf_path}: {e}"

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python read_pdf_tool.py <output_file> <path_to_pdf> [path_to_pdf2 ...]")
        sys.exit(1)
    
    output_file = sys.argv[1]
    
    with open(output_file, "w", encoding="utf-8") as f:
        for path in sys.argv[2:]:
            f.write(f"\n========================================\nFILE: {path}\n========================================\n")
            f.write(extract_text(path))
    
    print(f"Output written to {output_file}")
