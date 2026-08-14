import logging
from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field
from langgraph.graph import StateGraph, END
from typing_extensions import TypedDict
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_core.output_parsers import PydanticOutputParser

from app.services.llm_service import LLMService

logger = logging.getLogger(__name__)

class ExecutiveSummaryState(TypedDict):
    source_docs: List[str]
    source_asset_ids: List[str]
    llm_preset: str
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

def invoke_with_fallback(llm, schema_class, messages):
    parser = PydanticOutputParser(pydantic_object=schema_class)
    format_instructions = parser.get_format_instructions()
    
    # Inject format instructions into the last message
    last_msg = messages[-1].content
    messages[-1].content = f"{last_msg}\n\n{format_instructions}"
    
    try:
        response = llm.invoke(messages)
        return parser.parse(response.content)
    except Exception as e:
        # Simple fallback: Ask the LLM to fix its own JSON error
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
You are an expert Enterprise Architect. Extract the key architectural concepts from the following source documents.
Identify:
1. Business capabilities
2. Business drivers
3. Core architectural nodes/systems

Source Documents:
{docs_text[:15000]} # truncate to avoid token limits
"""
    try:
        res = invoke_with_fallback(llm, Concept, [HumanMessage(content=prompt)])
        
        # ACTIVE IMAGE EXTRACTION FROM PDFs
        extracted_figures = []
        asset_ids = state.get("source_asset_ids", [])
        if asset_ids:
            try:
                from app.services.asset_service import asset_service
                from app.database import SessionLocal
                from app.models.asset import Asset
                from pypdf import PdfReader
                import base64
                
                with SessionLocal() as db:
                    for asset_id in asset_ids:
                        try:
                            asset = db.query(Asset).filter(Asset.id == asset_id).first()
                            if asset:
                                file_path = str(asset_service.get_storage_path(asset))
                                if file_path.lower().endswith(".pdf"):
                                    reader = PdfReader(file_path)
                                    # Scan first 5 pages for safety/speed
                                    for page_num in range(min(5, len(reader.pages))):
                                        page = reader.pages[page_num]
                                        for image_file_object in page.images:
                                            image_bytes = image_file_object.data
                                            image_name = image_file_object.name
                                            # Determine extension from name or assume png
                                            image_ext = image_name.split(".")[-1].lower() if "." in image_name else "png"
                                            
                                            # Create a data URI
                                            b64 = base64.b64encode(image_bytes).decode("ascii")
                                            data_uri = f"data:image/{image_ext};base64,{b64}"
                                            extracted_figures.append(data_uri)
                                            
                                            if len(extracted_figures) >= 10: # Limit to 10 images total
                                                break
                                        if len(extracted_figures) >= 10:
                                            break
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
    
    prompt = f"""
You are a C-Level Executive synthesizing an architecture presentation.
Based on the extracted concepts, design a 4-5 slide executive summary presentation.
If a slide explains a process or structure, set has_diagram=true and provide diagram_nodes (using valid ArchiMate types like BusinessActor, ApplicationComponent, DataObject) and diagram_edges.

Source Context:
{docs_text[:5000]}

Extracted Concepts:
{concepts}
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
