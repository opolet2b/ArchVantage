import sys
try:
    import pypdf
except ImportError:
    try:
        import PyPDF2 as pypdf
    except ImportError:
        try:
            import fitz as pypdf
        except ImportError:
            print("No PDF library found. Please install pypdf, PyPDF2 or pymupdf.")
            sys.exit(1)

def extract_text(pdf_path):
    try:
        if 'fitz' in sys.modules:
            doc = pypdf.open(pdf_path)
            text = ""
            for page in doc:
                text += page.get_text()
            return text
        else:
            with open(pdf_path, 'rb') as f:
                reader = pypdf.PdfReader(f)
                text = ""
                for page in reader.pages:
                    text += page.extract_text()
                return text
    except Exception as e:
        return f"Error: {e}"

if __name__ == "__main__":
    pdf_path = sys.argv[1]
    text = extract_text(pdf_path)
    with open('pdf_output.txt', 'w', encoding='utf-8') as f:
        f.write(text)
    print("PDF text extracted to pdf_output.txt")
