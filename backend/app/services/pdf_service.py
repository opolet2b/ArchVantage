import pypdfium2 as pdfium
import base64
import io
from typing import List

class PDFService:
    def convert_pdf_to_images(self, file_path: str, page_indices: List[int] = None) -> List[str]:
        """
        Convert a PDF file to a list of base64 encoded images.
        
        Args:
            file_path: Path to the PDF file.
            page_indices: Optional list of specific page numbers (0-based) to render. If None, renders all.
            
        Returns:
            List[str]: List of base64 encoded image strings. 
                       Note: If page_indices is used, the list corresponds to those pages in order.
        """
        images_b64 = []
        try:
            # Load the PDF document
            pdf = pdfium.PdfDocument(file_path)
            
            # Determine pages to process
            if page_indices is not None:
                pages_to_process = page_indices
            else:
                pages_to_process = range(len(pdf))
            
            # Iterate through pages
            for i in pages_to_process:
                page = pdf[i]
                # Render the page to a bitmap
                # scale=2 gives better resolution (originally ~72dpi, scale=2 -> ~144dpi)
                bitmap = page.render(scale=2, rotation=0)
                pil_image = bitmap.to_pil()
                
                # Convert PIL image to base64
                buffered = io.BytesIO()
                pil_image.save(buffered, format="JPEG", quality=85)
                img_str = base64.b64encode(buffered.getvalue()).decode("utf-8")
                
                # Append standard data URI
                images_b64.append(img_str)
                
            return images_b64
            
        except Exception as e:
            print(f"[PDFService] Error converting PDF to images: {e}")
    def identify_visual_pages(self, file_path: str) -> List[int]:
        """
        Scan PDF pages for visual content (Images or Vectors/Charts).
        Returns a list of 0-based page indices that should be processed by VLM.
        """
        visual_pages = []
        try:
            pdf = pdfium.PdfDocument(file_path)
            for i in range(len(pdf)):
                page = pdf[i]
                has_visuals = False
                
                # Check for images or complex vector paths (potential charts)
                image_count = 0
                path_count = 0
                
                try:
                    for obj in page.get_objects():
                        if obj.type == 3: # Image
                            image_count += 1
                        elif obj.type == 2: # Path
                            # Heuristic: Filter out simple lines (separators, table borders)
                            # Get bounding box
                            bbox = obj.get_bounds() # (left, bottom, right, top)
                            if bbox:
                                width = abs(bbox[2] - bbox[0])
                                height = abs(bbox[3] - bbox[1])
                                
                                # Ignore checks:
                                # 1. Very thin lines (horizontal or vertical) < 3 points
                                # 2. Very small dots < 2x2 points
                                if (width < 3 or height < 3) or (width < 2 and height < 2):
                                    continue
                                    
                            path_count += 1
                            
                    # Heuristic: 
                    # - Any image is worth checking? No, increase to > 2 to avoid logos.
                    # - Significant paths (>15 was too low for tables).
                    # - FIX: Only trigger if > 50 significant paths (complex charts) OR > 2 images.
                    if image_count > 2 or path_count > 50:
                        visual_pages.append(i)
                        
                except Exception as e:
                    print(f"[PDFService] Error inspecting page {i}: {e}")
                    pass
                    
            print(f"[PDFService] Identified {len(visual_pages)}/{len(pdf)} visual pages in {file_path}")
            return visual_pages
            
        except Exception as e:
            print(f"[PDFService] Error identifying visual pages: {e}")
            return []
pdf_service = PDFService()
