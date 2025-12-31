import sys
import os
from pypdf import PdfReader

def extract_images(pdf_path, output_dir):
    try:
        if not os.path.exists(pdf_path):
            return f"Error: File not found at {pdf_path}"
        
        if not os.path.exists(output_dir):
            os.makedirs(output_dir)
            
        reader = PdfReader(pdf_path)
        count = 0
        
        for i, page in enumerate(reader.pages):
            for image_file_object in page.images:
                with open(os.path.join(output_dir, f"page_{i+1}_{image_file_object.name}"), "wb") as fp:
                    fp.write(image_file_object.data)
                    count += 1
        
        return f"Extracted {count} images from {os.path.basename(pdf_path)} to {output_dir}"
    except Exception as e:
        return f"Error reading {pdf_path}: {e}"

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python extract_images_tool.py <output_dir> <path_to_pdf> [path_to_pdf2 ...]")
        sys.exit(1)
    
    output_base_dir = sys.argv[1]
    
    for path in sys.argv[2:]:
        # Create a subdir for each pdf to avoid collisions
        pdf_name = os.path.splitext(os.path.basename(path))[0]
        pdf_output_dir = os.path.join(output_base_dir, pdf_name)
        print(extract_images(path, pdf_output_dir))
