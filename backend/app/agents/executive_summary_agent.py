import logging
import os
import json
import base64
import io
from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field
from langgraph.graph import StateGraph, END
from typing_extensions import TypedDict
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_core.output_parsers import PydanticOutputParser
from PIL import Image
import pymupdf

from app.services.llm_service import LLMService

logger = logging.getLogger(__name__)

class ExecutiveSummaryState(TypedDict):
    source_docs: List[str]
    source_asset_ids: List[str]
    llm_preset: str
    vlm_preset: str
    concepts: Dict[str, Any]
    slides: List[Dict[str, Any]]
    errors: List[str]

class Concept(BaseModel):
    capabilities: List[str] = Field(default_factory=list, description="Key architectural capabilities identified")
    drivers: List[str] = Field(default_factory=list, description="Business drivers or motivations identified")
    nodes: List[str] = Field(default_factory=list, description="Core architectural nodes or systems mentioned")
    figures: List[str] = Field(default_factory=list, description="List of URLs or paths for extracted figures")

class DiagramNode(BaseModel):
    id: str = Field(description="Unique ID for the node (e.g. node1)")
    type: str = Field(description="Valid ArchiMate type (e.g. BusinessActor, ApplicationComponent, DataObject, Node)")
    name: str = Field(description="Display name of the node")

class DiagramEdge(BaseModel):
    id: str = Field(description="Unique ID for the edge (e.g. edge1)")
    source: str = Field(description="Source node ID")
    target: str = Field(description="Target node ID")
    type: str = Field(default="Association", description="ArchiMate relationship type (e.g. Association, Flow, Serving)")

class Slide(BaseModel):
    title: str = Field(description="Title of the slide")
    takeaway: str = Field(description="1-2 sentence executive takeaway")
    concepts: List[str] = Field(description="Key bullet points to display")
    has_diagram: bool = Field(default=False, description="Whether this slide should suggest a diagram")
    diagram_nodes: List[DiagramNode] = Field(default_factory=list, description="List of nodes if has_diagram is true")
    diagram_edges: List[DiagramEdge] = Field(default_factory=list, description="List of edges connecting the nodes")

class StoryboarderResult(BaseModel):
    slides: List[Slide]

def get_llm(state: ExecutiveSummaryState):
    service = LLMService()
    preset = state.get("llm_preset")
    if not preset:
        preset = "default"
    llm, _ = service._get_model(preset)
    return llm

def get_vlm(state: ExecutiveSummaryState):
    service = LLMService()
    preset = state.get("vlm_preset")
    if not preset:
        preset = "default"
    vlm, _ = service._get_model(preset)
    return vlm

def invoke_with_fallback(llm, schema_class, messages):
    parser = PydanticOutputParser(pydantic_object=schema_class)
    format_instructions = parser.get_format_instructions()
    
    # Inject format instructions into the last message
    last_msg = messages[-1].content
    if isinstance(last_msg, str):
        messages[-1].content = f"{last_msg}\n\n{format_instructions}"
    
    try:
        response = None
        response = llm.invoke(messages)
        return parser.parse(response.content)
    except Exception as e:
        logger.warning(f"Failed to parse or invoke LLM: {e}. Trying to fix...")
        if response is None:
            raise Exception(f"LLM Invocation failed: {e}")
            
        fix_prompt = f"The following text was supposed to be a JSON object but failed to parse with error: {e}.\n\nText:\n{response.content}\n\nPlease output ONLY the corrected JSON object matching the required schema."
        response = llm.invoke([HumanMessage(content=fix_prompt)])
        return parser.parse(response.content)

def parser_agent(state: ExecutiveSummaryState):
    """Phase 1: Ingestion & Extraction (Mocked as Pass-through for now)"""
    return {"errors": []}

def concept_miner_agent(state: ExecutiveSummaryState):
    """Phase 1: Concept Extraction"""
    llm = get_llm(state)
    docs = state.get("source_docs", [])
    if not docs:
        return {"concepts": {"capabilities": [], "drivers": [], "nodes": [], "figures": []}}
        
    docs_text = "\n\n".join(docs)
    
    prompt = f"""
You are an Expert Enterprise Architect (TOGAF certified) and a Tier-1 Strategy Consultant (e.g., McKinsey/BCG).
Your objective is to analyze the provided architecture documents and extract the absolute core concepts required to present a 'Target Operating Model' and 'Strategic Transformation' to C-Level executives (CIO, CTO, CEO).

Focus on:
1. The "Burning Platform" (Why change is needed, Business Challenges, Regulatory mandates).
2. The Strategic Drivers & Business Value (What the target architecture enables).
3. The Target Architecture & Interoperability (Key systems, integration layers like ESB/API Gateways, and data flow).
4. The Implementation Roadmap (Phasing, migration, success factors).

Extract these strictly into the requested JSON schema. Be highly analytical, concise, and use professional Enterprise Architecture terminology.

Documents:
{docs_text[:10000]}
"""
    try:
        res = invoke_with_fallback(llm, Concept, [HumanMessage(content=prompt)])
        
        # ACTIVE IMAGE EXTRACTION FROM PDFs
        extracted_figures = []
        asset_ids = state.get("source_asset_ids", [])
        if asset_ids:
            try:
                from app.services.asset_service import asset_service
                from app.core.database import SessionLocal
                from app.models.asset_models import Asset
                
                with SessionLocal() as db:
                    for asset_id in asset_ids:
                        try:
                            asset = db.query(Asset).filter(Asset.id == asset_id).first()
                            if asset:
                                file_path = str(asset_service.get_storage_path(asset))
                                if file_path.lower().endswith(".pdf"):
                                    doc = pymupdf.open(file_path)
                                    vlm = get_vlm(state)
                                    
                                    for i in range(len(doc)):
                                        page = doc[i]
                                        pix = page.get_pixmap(matrix=pymupdf.Matrix(2, 2))
                                        img_data = pix.tobytes("jpeg", jpg_quality=85)
                                        b64_img = base64.b64encode(img_data).decode("utf-8")
                                        
                                        vlm_prompt = (
                                            "You are an expert Enterprise Architect processing an architectural document.\n"
                                            "Analyze this page. If there is a clear architectural diagram, schema, or flowchart on this page, "
                                            "return its approximate bounding box as a JSON object with 'x', 'y', 'width', and 'height' keys (values between 0.0 and 1.0 representing percentage of page width/height). "
                                            "If there is NO architectural diagram (e.g. it's just text, a logo, or a table), return an empty JSON object: {}\n"
                                            "Output ONLY valid JSON."
                                        )
                                        
                                        messages = [
                                            HumanMessage(content=[
                                                {"type": "text", "text": vlm_prompt},
                                                {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{b64_img}"}}
                                            ])
                                        ]
                                        
                                        try:
                                            vlm_res = vlm.invoke(messages)
                                            res_text = vlm_res.content.strip()
                                            if res_text.startswith("```json"):
                                                res_text = res_text[7:-3]
                                            elif res_text.startswith("```"):
                                                res_text = res_text[3:-3]
                                                
                                            box = json.loads(res_text.strip())
                                            
                                            if box and all(k in box for k in ["x", "y", "width", "height"]):
                                                pil_img = Image.open(io.BytesIO(img_data))
                                                img_w, img_h = pil_img.size
                                                
                                                left = int(box["x"] * img_w)
                                                top = int(box["y"] * img_h)
                                                right = int((box["x"] + box["width"]) * img_w)
                                                bottom = int((box["y"] + box["height"]) * img_h)
                                                
                                                # Padding
                                                left = max(0, left - 20)
                                                top = max(0, top - 20)
                                                right = min(img_w, right + 20)
                                                bottom = min(img_h, bottom + 20)
                                                
                                                cropped = pil_img.crop((left, top, right, bottom))
                                                
                                                out_bytes = io.BytesIO()
                                                cropped.save(out_bytes, format="PNG")
                                                b64_cropped = base64.b64encode(out_bytes.getvalue()).decode("utf-8")
                                                
                                                fig_url = f"data:image/png;base64,{b64_cropped}"
                                                extracted_figures.append(fig_url)
                                                
                                                if len(extracted_figures) >= 15:
                                                    break
                                        except Exception as ve:
                                            logger.warning(f"VLM extraction failed for page {i}: {ve}")
                                    doc.close()
                        except Exception as inner_e:
                            logger.error(f"Failed to parse asset {asset_id}: {inner_e}")
            except Exception as e:
                logger.error(f"Image extraction failed: {e}")
        
        res.figures = extracted_figures
        
        return {"concepts": res.model_dump()}
    except Exception as e:
        logger.error(f"Concept Mining failed: {e}")
        return {"concepts": {"capabilities": [], "drivers": [], "nodes": [], "figures": []}}

def synthesizer_and_storyboarder_agent(state: ExecutiveSummaryState):
    """Phase 2b & 2c: C-Level Synthesizer and Storyboarder"""
    llm = get_llm(state)
    concepts = state.get("concepts", {})
    docs = state.get("source_docs", [])
    
    docs_text = "\n\n".join(docs)
    
    # Do not send massive base64 image strings to the LLM
    concepts_for_prompt = dict(concepts)
    if "figures" in concepts_for_prompt:
        concepts_for_prompt["figures"] = [f"Figure {i+1} (Image Data)" for i in range(len(concepts_for_prompt["figures"]))]
    
    prompt = f"""
You are a Tier-1 Strategy Consultant and Enterprise Architect designing a C-Level Executive Presentation.
Based on the extracted concepts, design a 4-5 slide presentation that tells a compelling, top-down story (Minto Pyramid Principle).

Slide Structure guidelines:
Slide 1: Strategic Drivers & Regulatory Framework (The Burning Platform & Mandate)
Slide 2: Core Capabilities & Business Value Delivered
Slide 3: Reference Architecture & Integration Strategy (Target Operating Model)
Slide 4: Architectural Evaluation & Target Choice (If applicable)
Slide 5: Implementation Timeline & Critical Success Factors

For each slide, provide a powerful 'takeaway' sentence that summarizes the slide's main message.
If a slide explains a process or structure (like Slide 3), set has_diagram=true and provide diagram_nodes (using valid ArchiMate types) and diagram_edges to visualize the architecture. Keep the diagrams focused on the highest-level components (e.g., ESB, Gateways, Core Systems).

Source Context:
{docs_text[:5000]}

Extracted Concepts:
{concepts_for_prompt}
"""
    try:
        res = invoke_with_fallback(llm, StoryboarderResult, [
            SystemMessage(content="You are an expert presentation designer."),
            HumanMessage(content=prompt)
        ])
        
        slides_data = res.model_dump()["slides"]
        
        # Build Archimate JSON for slides with diagrams
        for slide in slides_data:
            if slide.get("has_diagram") and slide.get("diagram_nodes"):
                nodes_data = slide["diagram_nodes"]
                edges_data = slide.get("diagram_edges", [])
                
                elements = {}
                diagram_nodes = []
                x = 50
                y = 50
                
                for idx, node in enumerate(nodes_data):
                    nid = node["id"]
                    elements[nid] = {"type": node["type"], "name": node["name"]}
                    diagram_nodes.append({
                        "id": nid,
                        "bounds": {"x": x, "y": y, "width": 140, "height": 55}
                    })
                    # Simple layout: wrap every 3 nodes
                    x += 160
                    if (idx + 1) % 3 == 0:
                        x = 50
                        y += 100

                relationships = {}
                diagram_edges = []
                for edge in edges_data:
                    eid = edge["id"]
                    relationships[eid] = {
                        "type": edge.get("type", "Association"),
                        "source": edge["source"],
                        "target": edge["target"]
                    }
                    diagram_edges.append({
                        "id": eid,
                        "source": edge["source"],
                        "target": edge["target"]
                    })
                
                slide["archimate_data"] = {
                    "elements": elements,
                    "relationships": relationships,
                    "diagrams": [{
                        "id": "slide_diag",
                        "name": slide.get("title", "Diagram"),
                        "nodes": diagram_nodes,
                        "edges": diagram_edges
                    }]
                }
        
        return {"slides": slides_data}
    except Exception as e:
        logger.error(f"Storyboarding failed: {e}")
        return {"slides": []}

def build_executive_summary_graph():
    workflow = StateGraph(ExecutiveSummaryState)
    
    workflow.add_node("parser_agent", parser_agent)
    workflow.add_node("concept_miner", concept_miner_agent)
    workflow.add_node("storyboarder", synthesizer_and_storyboarder_agent)
    
    workflow.set_entry_point("parser_agent")
    workflow.add_edge("parser_agent", "concept_miner")
    workflow.add_edge("concept_miner", "storyboarder")
    workflow.add_edge("storyboarder", END)
    
    return workflow.compile()
