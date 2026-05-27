import os
import json
from typing import List, Optional, Dict, Any
from llama_index.core import Document, VectorStoreIndex, StorageContext

class SlideshowIngestor:
    """
    Specialized ingestor for PowerPoint presentations.
    Extracts spatial layout, shapes, colors, and hierarchy to provide better context to the LLM.
    """
    
    def __init__(self):
        pass

    def ingest_slideshow(self, file_path: str, index: VectorStoreIndex, storage_context: StorageContext, conversation_id: Optional[str] = None, metadata: Optional[dict] = None, progress_callback=None):
        """
        Ingest a PowerPoint file using its pre-extracted JSON structure.
        """
        print(f"[SlideshowIngestor] Starting advanced ingestion for: {file_path}")
        
        json_path = f"{file_path}.json"
        if not os.path.exists(json_path):
            print(f"[SlideshowIngestor] Sidecar JSON not found: {json_path}")
            return {"status": "error", "message": "Sidecar JSON not found"}

        try:
            with open(json_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
            
            slides = data.get("slides", [])
            print(f"[SlideshowIngestor] Found {len(slides)} slides to process.")
            
            documents = []
            
            for i, slide in enumerate(slides):
                slide_number = slide.get("slide_number", i + 1)
                
                # Header with Layout Context
                slide_text_parts = [f"Slide {slide_number} (Layout: x,y,w,h normalized 0.0-1.0)"]
                
                # FIX: PPTXService outputs 'elements', but we were looking for 'shapes'. 
                # Support both for backward compatibility.
                shapes = slide.get("elements", slide.get("shapes", []))
                
                # Sort shapes by vertical position (y) to approximate reading order
                try:
                    sorted_shapes = sorted(shapes, key=lambda s: s.get("y", 0))
                except:
                    sorted_shapes = shapes

                slide_content_lines = []
                
                for s in sorted_shapes:
                    text = s.get("text", "").strip()
                    shape_type = s.get("type", "UNKNOWN")
                    shape_kind = s.get("shape_kind", "") # e.g. RECTANGLE
                    
                    # Formatting logic
                    type_str = shape_type
                    if shape_kind:
                        type_str += f": {shape_kind}"
                        
                    layout_str = ""
                    if "x" in s and "y" in s:
                        x = f"{s['x']:.2f}"
                        y = f"{s['y']:.2f}"
                        w = f"{s['w']:.2f}"
                        h = f"{s['h']:.2f}"
                        layout_str = f"(x={x}, y={y}, w={w}, h={h})"
                        
                    color_str = ""
                    if s.get("fill_color"):
                         color_str += f" Fill:{s['fill_color']}"
                    if s.get("line_color"):
                         color_str += f" Line:{s['line_color']}"
                    if color_str:
                        color_str = f"({color_str.strip()})"
                        
                    if text or shape_type in ["IMAGE", "TABLE"]:
                         line = f"[{type_str}] {layout_str} {color_str} \"{text}\""
                         slide_content_lines.append(line)
                    elif shape_type == "SHAPE" and color_str:
                         line = f"[{type_str}] {layout_str} {color_str} [Visual Element]"
                         slide_content_lines.append(line)
                
                if slide_content_lines:
                    slide_text_parts.append("\n".join(slide_content_lines))
                
                # Extract speaker notes
                notes = slide.get("notes", "")
                if notes:
                    slide_text_parts.append(f"\nSpeaker Notes:\n{notes}")
                
                full_slide_text = "\n".join(slide_text_parts)
                
                # Create Document
                doc_metadata = metadata.copy() if metadata else {}
                doc_metadata.update({
                    "source": file_path,
                    "slide_number": slide_number,
                    "type": "slide"
                })
                if conversation_id:
                    doc_metadata["conversation_id"] = conversation_id
                
                documents.append(Document(text=full_slide_text, metadata=doc_metadata))

            if documents:
                if index is None:
                     print("[SlideshowIngestor] Error: Index is None.")
                     return {"status": "error", "message": "Vector Index not initialized"}

                from llama_index.core import Settings
                nodes = Settings.node_parser.get_nodes_from_documents(documents)
                
                total_nodes = len(nodes)
                batch_size = 100
                
                print(f"[SlideshowIngestor] Vectorizing {total_nodes} nodes from {len(documents)} slides...")
                
                for i in range(0, total_nodes, batch_size):
                    batch = nodes[i:i + batch_size]
                    index.insert_nodes(batch)
                    if progress_callback:
                        progress_callback(min(i + batch_size, total_nodes), total_nodes)
                
                print(f"[SlideshowIngestor] Slideshow ingestion complete.")
                return {"status": "success", "count": len(documents)}
            else:
                 return {"status": "no_content"}

        except Exception as e:
            print(f"[SlideshowIngestor] Error ingesting slideshow: {e}")
            raise e

slideshow_ingestor = SlideshowIngestor()
