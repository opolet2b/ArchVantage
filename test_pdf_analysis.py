
import pypdfium2 as pdfium
import sys
import os

# Path to a known PDF (from previous steps)
# c:\Users\opole\Downloads\ChatBotn\backend\data\uploads\a55710a0-e0e7-4a47-90c9-ce3dd6c857f3\factsheet-d.pdf
PDF_PATH = r"c:\Users\opole\Downloads\ChatBotn\backend\data\uploads\a55710a0-e0e7-4a47-90c9-ce3dd6c857f3\factsheet-d.pdf"

if not os.path.exists(PDF_PATH):
    print(f"File not found: {PDF_PATH}")
    sys.exit(1)

print(f"Analyzing {PDF_PATH}...")
pdf = pdfium.PdfDocument(PDF_PATH)
print(f"Pages: {len(pdf)}")

for i, page in enumerate(pdf):
    # Load page
    # In pypdfium2 v4+, valid usage is page.get_objects() loops generator
    print(f"--- Page {i+1} ---")
    image_count = 0
    path_count = 0
    text_count = 0
    
    try:
        # Inspect objects
        for obj in page.get_objects():
            type_id = obj.type
            # 1=Text, 2=Path, 3=Image, 4=Shading, 5=Form
            if type_id == 3: # Image
                image_count += 1
            elif type_id == 2: # Path (could be charts)
                path_count += 1
            elif type_id == 1: # Text
                text_count += 1
                
        print(f"  Images: {image_count}")
        print(f"  Paths: {path_count} (Vector graphics)")
        print(f"  Text Blocks: {text_count}")
        
    except Exception as e:
        print(f"  Error inspecting objects: {e}")
