import pypdfium2 as pdfium
import base64
import io
from typing import List

class PDFService:
    def convert_pdf_to_images(self, file_path: str) -> List[str]:
        """
        Convert a PDF file to a list of base64 encoded images (one per page).
        
        Args:
            file_path: Path to the PDF file.
            
        Returns:
            List[str]: List of base64 encoded image strings (data:image/jpeg;base64,...).
        """
        images_b64 = []
        try:
            # Load the PDF document
            pdf = pdfium.PdfDocument(file_path)
            
            # Iterate through pages
            for i in range(len(pdf)):
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
            raise e

# Singleton instance
pdf_service = PDFService()
