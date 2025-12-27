import os
from typing import List, Dict, Any, Optional
import pptx
from pptx.enum.shapes import MSO_SHAPE_TYPE

class PPTXService:
    def __init__(self):
        pass

    def process_presentation(self, file_path: str) -> Dict[str, Any]:
        """
        Parse a PPTX file and return a structured JSON representation of its slides.
        
        Returns:
            Dict containing:
            - total_slides: int
            - slides: List[Dict] (each slide with index, elements, dimensions)
        """
        if not os.path.exists(file_path):
            raise FileNotFoundError(f"PPTX file not found: {file_path}")

        try:
            prs = pptx.Presentation(file_path)
            
            # Base dimensions (Emu units in python-pptx)
            # We want to normalize everything to 0.0 - 1.0 relative to slide size
            slide_width = prs.slide_width
            slide_height = prs.slide_height
            
            slides_data = []
            
            for i, slide in enumerate(prs.slides):
                slide_info = self._extract_slide(slide, i, slide_width, slide_height)
                slides_data.append(slide_info)
                
            return {
                "total_slides": len(slides_data),
                "slides": slides_data,
                "meta": {
                    "width_emu": slide_width,
                    "height_emu": slide_height
                }
            }
            
        except Exception as e:
            print(f"[PPTXService] Error processing {file_path}: {e}")
            raise e

    def _extract_slide(self, slide, index: int, width_emu: int, height_emu: int) -> Dict[str, Any]:
        """Extract elements from a single slide."""
        elements = []
        
        # 1. Shapes extraction
        for shape in slide.shapes:
            element = self._parse_shape(shape, width_emu, height_emu)
            if element:
                elements.append(element)
                
        # 2. Extract speaker notes if available
        notes = ""
        if slide.has_notes_slide:
            text_frame = slide.notes_slide.notes_text_frame
            if text_frame:
                notes = text_frame.text

        return {
            "index": index,
            "elements": elements,
            "notes": notes,
            # Placeholder for AI description (Phase 2)
            "ai_description": "" 
        }

    def _extract_text_from_shape(self, shape) -> str:
        """Recursively extract text from a shape (including groups)."""
        text_parts = []
        
        # 1. Direct text frame (TextBoxes, Autoshape, Placeholders)
        if hasattr(shape, "text_frame") and shape.text_frame:
             for p in shape.text_frame.paragraphs:
                 # Flatten runs? Usually p.text is sufficient.
                 if p.text.strip():
                     text_parts.append(p.text.strip())
        
        # 2. Table text
        if shape.shape_type == MSO_SHAPE_TYPE.TABLE:
            for row in shape.table.rows:
                row_text = []
                for cell in row.cells:
                    if cell.text_frame and cell.text.strip():
                        row_text.append(cell.text.strip())
                if row_text:
                    text_parts.append(" | ".join(row_text))

        # 3. Group recursion
        if shape.shape_type == MSO_SHAPE_TYPE.GROUP:
            for child in shape.shapes:
                child_text = self._extract_text_from_shape(child)
                if child_text:
                    text_parts.append(child_text)
                    
        return "\n".join(text_parts)

    def _parse_shape(self, shape, total_w, total_h) -> Optional[Dict[str, Any]]:
        """
        Parse a shape into a Normalized Element dict.
        Returns None if shape should be ignored.
        """
        try:
            # Basic geometry
            x = shape.left / total_w
            y = shape.top / total_h
            w = shape.width / total_w
            h = shape.height / total_h
            
            shape_type = shape.shape_type
            
            # recursive text extraction
            extracted_text = self._extract_text_from_shape(shape)
            
            # Color Extraction
            fill_color = None
            line_color = None
            try:
                if hasattr(shape, "fill") and shape.fill.type and hasattr(shape.fill, "fore_color"):
                     # hasattr check is sometimes insufficient for .type on some shapes
                     if hasattr(shape.fill, "fore_color") and hasattr(shape.fill.fore_color, "rgb"):
                        fill_color = str(shape.fill.fore_color.rgb)
            except Exception:
                pass
                
            try:
                if hasattr(shape, "line") and hasattr(shape.line, "color") and hasattr(shape.line.color, "rgb"):
                    line_color = str(shape.line.color.rgb)
            except Exception:
                pass

            element = {
                "id": shape.shape_id,
                "x": x,
                "y": y,
                "w": w,
                "h": h,
                "raw_type": str(shape_type),
                "text": extracted_text,
                "fill_color": fill_color,
                "line_color": line_color
            }
            
            # Identify Type
            if shape_type == MSO_SHAPE_TYPE.TEXT_BOX:
                element["type"] = "TEXT"
            elif shape_type == MSO_SHAPE_TYPE.PLACEHOLDER:
                 element["type"] = "TEXT" # Titles, body placeholders
            elif shape_type == MSO_SHAPE_TYPE.AUTO_SHAPE:
                element["type"] = "SHAPE"
                if hasattr(shape, "auto_shape_type"):
                    element["shape_kind"] = str(shape.auto_shape_type)
            elif shape_type == MSO_SHAPE_TYPE.PICTURE:
                element["type"] = "IMAGE"
                element["text"] = "[Image]" 
            elif shape_type == MSO_SHAPE_TYPE.GROUP:
                element["type"] = "GROUP"
            elif shape_type == MSO_SHAPE_TYPE.TABLE:
                element["type"] = "TABLE"
            else:
                element["type"] = "UNKNOWN"
                
            # Filter empty elements BUT keep groups if they have text
            if not extracted_text and element["type"] in ["TEXT", "TABLE", "GROUP"]:
                 # If it's a visual shape, keep it. If it's pure text/group/table without content, drop it.
                 # Actually, SHAPE might be visual only.
                 if element["type"] == "SHAPE":
                     pass 
                 else:
                     return None
            
            return element
            
        except Exception as e:
            print(f"[PPTXService] Warning parsing shape: {e}")
            return None

pptx_service = PPTXService()
