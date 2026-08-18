from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional, Dict

from app.agents.architectural_scenario_agent import build_architectural_scenario_graph, build_baseline_extractor_graph, ArchitecturalScenarioResult, ArchitecturalBaseline
from app.core.database import SessionLocal
from app.models.canvas_models import CanvasThing

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
