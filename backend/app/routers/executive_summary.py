from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List

from app.agents.executive_summary_agent import build_executive_summary_graph

router = APIRouter(
    prefix="/executive_summary",
    tags=["executive_summary"],
)

class ExecutiveSummaryRequest(BaseModel):
    source_docs: List[str]
    source_asset_ids: List[str] = []
    llm_preset: str = "default"

@router.post("/generate")
async def run_executive_summary(request: ExecutiveSummaryRequest):
    try:
        graph = build_executive_summary_graph()
        
        # Invoke the graph
        result = graph.invoke({
            "source_docs": request.source_docs,
            "source_asset_ids": request.source_asset_ids,
            "llm_preset": request.llm_preset,
            "concepts": {},
            "slides": [],
            "errors": []
        })
        
        return {
            "status": "success",
            "concepts": result.get("concepts", {}),
            "slides": result.get("slides", [])
        }
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

from fastapi.responses import StreamingResponse
import io

class SlideModel(BaseModel):
    title: str
    takeaway: str
    concepts: List[str]
    has_diagram: bool = False
    diagram_url: str = None
    archimate_data: dict = None

class ExportPPTXRequest(BaseModel):
    slides: List[SlideModel]

@router.post("/export_pptx")
async def export_pptx(request: ExportPPTXRequest):
    try:
        from pptx import Presentation
        from pptx.util import Inches, Pt
        from pptx.enum.shapes import MSO_SHAPE, MSO_CONNECTOR
        import pptx
        import requests
        import io

        prs = Presentation()
        
        for slide_data in request.slides:
            # If there's a diagram, we might want a different layout, but for now we just use a blank/content layout
            slide_layout = prs.slide_layouts[1] # 1 is Title and Content
            slide = prs.slides.add_slide(slide_layout)
            
            # Title
            title_shape = slide.shapes.title
            if title_shape:
                title_shape.text = slide_data.title
            
            # Body (Takeaway + Concepts)
            body_shape = slide.placeholders[1]
            tf = body_shape.text_frame
            
            # Add Takeaway as first paragraph, bold
            p_takeaway = tf.text = f"Takeaway: {slide_data.takeaway}"
            p_takeaway_para = tf.paragraphs[0]
            p_takeaway_para.font.bold = True
            p_takeaway_para.font.color.rgb = pptx.dml.color.RGBColor(0, 102, 204) # Blueish
            
            # Add Concepts as bullet points
            for concept in slide_data.concepts:
                p = tf.add_paragraph()
                p.text = concept
                p.level = 1
                
            # If there's an ArchiMate Diagram, draw it using native shapes
            if getattr(slide_data, "archimate_data", None):
                archimate = slide_data.archimate_data
                diagrams = archimate.get("diagrams", [])
                if diagrams:
                    diag = diagrams[0]
                    # Base offsets
                    left_offset = Inches(5.0)
                    top_offset = Inches(2.0)
                    scale = 0.02 # 1px = 0.02 inches
                    
                    shape_map = {}
                    
                    for node in diag.get("nodes", []):
                        bounds = node.get("bounds", {"x":0,"y":0,"width":140,"height":55})
                        x = left_offset + Inches(bounds["x"] * scale)
                        y = top_offset + Inches(bounds["y"] * scale)
                        w = Inches(bounds["width"] * scale)
                        h = Inches(bounds["height"] * scale)
                        
                        node_id = node.get("id")
                        name = node_id
                        if node_id in archimate.get("elements", {}):
                            name = archimate["elements"][node_id].get("name", name)
                            
                        shape = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, x, y, w, h)
                        shape.text = name
                        # Make text fit
                        for para in shape.text_frame.paragraphs:
                            para.font.size = Pt(12)
                        shape_map[node_id] = shape
                        
                    for edge in diag.get("edges", []):
                        source_id = edge.get("source")
                        target_id = edge.get("target")
                        if source_id in shape_map and target_id in shape_map:
                            s_shape = shape_map[source_id]
                            t_shape = shape_map[target_id]
                            connector = slide.shapes.add_connector(MSO_CONNECTOR.STRAIGHT, 0, 0, 0, 0)
                            connector.begin_connect(s_shape, 3) # right side
                            connector.end_connect(t_shape, 1)   # left side
                            
                    # Shrink the text box to make room
                    body_shape.width = Inches(4.5)
                    
            # Else if there's a standard image, download and insert it
            elif getattr(slide_data, "diagram_url", None):
                try:
                    url = slide_data.diagram_url
                    
                    if url.startswith("data:image"):
                        # Decode base64 data URI
                        header, encoded = url.split(",", 1)
                        import base64
                        image_stream = io.BytesIO(base64.b64decode(encoded))
                    else:
                        # Handle local assets
                        if url.startswith("/api/v1/assets/"):
                            # We would need to resolve this locally, but for now we skip or construct localhost url
                            url = "http://localhost:8000" + url
                            
                        response = requests.get(url, timeout=5)
                        if response.status_code == 200:
                            image_stream = io.BytesIO(response.content)
                        else:
                            image_stream = None

                    if image_stream:
                        # Add image to the right side of the slide
                        # standard slide is 10 inches wide, 7.5 inches tall
                        left = Inches(5.5)
                        top = Inches(2.0)
                        width = Inches(4.0)
                        
                        slide.shapes.add_picture(image_stream, left, top, width=width)
                        
                        # Shrink the text box to make room
                        body_shape.width = Inches(5.0)
                except Exception as e:
                    print(f"Failed to add image to PPTX: {e}")
                
        # Save to memory
        ppt_stream = io.BytesIO()
        prs.save(ppt_stream)
        ppt_stream.seek(0)
        
        return StreamingResponse(
            ppt_stream,
            media_type="application/vnd.openxmlformats-officedocument.presentationml.presentation",
            headers={
                "Content-Disposition": 'attachment; filename="executive_summary.pptx"'
            }
        )
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

class RegenerateSlideRequest(BaseModel):
    source_docs: List[str]
    slide: SlideModel
    llm_preset: str = "default"

@router.post("/regenerate_slide")
async def regenerate_slide(request: RegenerateSlideRequest):
    try:
        from app.agents.executive_summary_agent import Slide, invoke_with_fallback, get_llm
        from langchain_core.messages import HumanMessage
        
        llm = get_llm({"llm_preset": request.llm_preset})
        
        docs_text = "\n\n".join(request.source_docs)
        
        prompt = f"""
You are an expert Executive Architect. Your task is to rewrite and polish a single slide for an executive presentation.
Use the provided Source Context as background knowledge.

Source Context:
{docs_text[:15000]} # truncate to avoid token limits

Current Slide State:
Title: {request.slide.title}
Takeaway: {request.slide.takeaway}
Bullet Points/Concepts: {', '.join(request.slide.concepts)}

Instructions:
1. Refine the Title so it is punchy and professional.
2. Rewrite the Executive Takeaway to be a compelling, 1-2 sentence summary of the slide's core message.
3. Polish the Bullet Points so they are concise, action-oriented, and clearly explain the concepts.
4. Output the result in JSON format matching the Slide schema.
"""
        res = invoke_with_fallback(llm, Slide, [HumanMessage(content=prompt)])
        
        return {
            "status": "success",
            "slide": res.model_dump()
        }
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
