from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import os
import json

from app.agents.architectural_scenario_agent import build_architectural_scenario_graph, build_baseline_extractor_graph, ArchitecturalScenarioResult, ArchitecturalBaseline
from app.core.database import SessionLocal
from app.models.canvas_models import CanvasThing
from app.utils.docx_exporter import generate_scenario_docx

router = APIRouter(
    prefix="/architectural_scenario",
    tags=["architectural_scenario"],
)

class IngestRequest(BaseModel):
    document_ids: List[str]

@router.post("/ingest")
async def ingest_scenario(request: IngestRequest):
    db = SessionLocal()
    try:
        documents_content = []
        for doc_id in request.document_ids:
            thing = db.query(CanvasThing).filter(CanvasThing.id == doc_id).first()
            if thing:
                content_dict = thing.content or {}
                if isinstance(content_dict, str):
                    text = content_dict
                else:
                    text = content_dict.get('text') or content_dict.get('content') or str(content_dict)
                documents_content.append(text)
        
        if not documents_content:
            return {"status": "error", "message": "No valid documents found."}

        document_context = "\n\n---\n\n".join(documents_content)

        graph = build_baseline_extractor_graph()
        
        result = await graph.ainvoke({
            "document_context": document_context,
            "baseline": None
        })
        
        baseline: ArchitecturalBaseline = result.get("baseline")
        if not baseline:
            raise Exception("LLM failed to extract baseline architecture")
            
        return {"status": "success", "baseline": baseline.model_dump()}
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()

class ScenarioRequest(BaseModel):
    canvas_id: str
    thing_id: str
    action: str
    target_technology: str
    target_entity_ids: Optional[List[str]] = None
    custom_prompt: str
    document_ids: List[str]
    baseline: Optional[Dict] = None

@router.post("/simulate")
async def simulate_scenario(request: ScenarioRequest):
    # This route is kept for legacy compatibility, but we will add a streaming version below.
    db = SessionLocal()
    try:
        documents_content = []
        for doc_id in request.document_ids:
            thing = db.query(CanvasThing).filter(CanvasThing.id == doc_id).first()
            if thing:
                content_dict = thing.content or {}
                if isinstance(content_dict, str):
                    text = content_dict
                else:
                    text = content_dict.get('text') or content_dict.get('content') or str(content_dict)
                documents_content.append(text)

        document_context = "\n\n---\n\n".join(documents_content) if documents_content else "No explicit document context provided."

        graph = build_architectural_scenario_graph()
        
        result = await graph.ainvoke({
            "action": request.action,
            "target_technology": request.target_technology,
            "target_entity_ids": request.target_entity_ids,
            "custom_prompt": request.custom_prompt,
            "document_context": document_context,
            "baseline": request.baseline,
            "result": None
        })
        
        sim_result: ArchitecturalScenarioResult = result.get("result")
        if not sim_result:
            raise Exception("LLM failed to generate a scenario result")
            
        return {"status": "success", "result": sim_result.model_dump()}
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()

@router.post("/simulate-stream")
async def simulate_scenario_stream(request: ScenarioRequest):
    db = SessionLocal()
    
    documents_content = []
    for doc_id in request.document_ids:
        thing = db.query(CanvasThing).filter(CanvasThing.id == doc_id).first()
        if thing:
            content_dict = thing.content or {}
            if isinstance(content_dict, str):
                text = content_dict
            else:
                text = content_dict.get('text') or content_dict.get('content') or str(content_dict)
            documents_content.append(text)

    document_context = "\n\n---\n\n".join(documents_content) if documents_content else "No explicit document context provided."
    db.close()

    async def event_generator():
        graph = build_architectural_scenario_graph()
        initial_state = {
            "action": request.action,
            "target_technology": request.target_technology,
            "target_entity_ids": request.target_entity_ids,
            "custom_prompt": request.custom_prompt,
            "document_context": document_context,
            "baseline": request.baseline,
            "result": None
        }
        
        try:
            final_state = None
            async for event in graph.astream(initial_state):
                for node_name, node_state in event.items():
                    yield f"data: {json.dumps({'type': 'progress', 'node': node_name})}\n\n"
                    final_state = node_state
            
            if final_state and "result" in final_state:
                sim_result = final_state["result"]
                yield f"data: {json.dumps({'type': 'complete', 'result': sim_result.model_dump()})}\n\n"
            else:
                yield f"data: {json.dumps({'type': 'error', 'message': 'Graph failed to produce a final result'})}\n\n"
        except Exception as e:
            import traceback
            traceback.print_exc()
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")

class DocxExportRequest(BaseModel):
    action: str
    targetTech: Optional[str] = None
    customPrompt: Optional[str] = None
    risk_score: int
    risk_rationale: str
    baseline_svg: Optional[str] = None
    tobe_svg: Optional[str] = None
    phases: List[Dict[str, Any]]

@router.post("/export-docx")
async def export_scenario_docx(request: DocxExportRequest):
    try:
        payload = request.model_dump()
        docx_path = generate_scenario_docx(payload)
        return FileResponse(
            docx_path,
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            filename="Architectural_Scenario_Impact.docx",
            background=None
        )
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
