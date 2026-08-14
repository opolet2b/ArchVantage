from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List

from app.agents.scenario_simulator_agent import build_doc_parser_graph, build_constraint_solver_graph, build_copilot_graph, VariableConstraints, ExtractedTopology
from app.core.database import SessionLocal
from app.models.canvas_models import CanvasThing

router = APIRouter(
    prefix="/scenario_simulator",
    tags=["scenario_simulator"],
)

class IngestRequest(BaseModel):
    document_ids: List[str]
    llm_preset: str = "default"

@router.post("/ingest")
async def run_ingestion(request: IngestRequest):
    db = SessionLocal()
    try:
        # Fetch the actual document contents from DB
        documents_content = []
        for doc_id in request.document_ids:
            thing = db.query(CanvasThing).filter(CanvasThing.id == doc_id).first()
            if thing:
                # Assuming content is either text or has a text field
                content_dict = thing.content or {}
                text = content_dict.get('text') or content_dict.get('content') or str(content_dict)
                documents_content.append(text)
        
        if not documents_content:
            return {"status": "error", "message": "No valid documents found."}

        graph = build_doc_parser_graph()
        
        # Invoke the graph
        result = graph.invoke({
            "documents": documents_content,
            "llm_preset": request.llm_preset,
            "topology": None,
            "errors": []
        })
        
        topology = result.get("topology")
        topology_data = topology.model_dump() if topology else None
        
        return {"status": "success", "report": topology_data}
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()

class SimulateRequest(BaseModel):
    topology: ExtractedTopology
    constraints: VariableConstraints
    llm_preset: str = "default"

@router.post("/simulate")
async def run_simulation(request: SimulateRequest):
    try:
        graph = build_constraint_solver_graph()
        
        result = graph.invoke({
            "topology": request.topology,
            "constraints": request.constraints,
            "llm_preset": request.llm_preset,
            "simulation_result": None,
            "errors": []
        })
        
        simulation_result = result.get("simulation_result")
        sim_data = simulation_result.model_dump() if simulation_result else None
        
        return {"status": "success", "result": sim_data}
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

class CopilotRequest(BaseModel):
    user_message: str
    current_constraints: VariableConstraints
    llm_preset: str = "default"

@router.post("/copilot")
async def run_copilot(request: CopilotRequest):
    try:
        graph = build_copilot_graph()
        
        result = graph.invoke({
            "user_message": request.user_message,
            "current_constraints": request.current_constraints,
            "llm_preset": request.llm_preset,
            "copilot_response": None,
            "errors": []
        })
        
        copilot_response = result.get("copilot_response")
        response_data = copilot_response.model_dump() if copilot_response else None
        
        return {"status": "success", "result": response_data}
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
