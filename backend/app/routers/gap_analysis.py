from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel
from typing import List, Dict, Any

from app.agents.gap_analysis_agent import build_gap_analysis_graph

router = APIRouter(
    prefix="/gap_analysis",
    tags=["gap_analysis"],
)

class GapAnalysisRequest(BaseModel):
    baseline_docs: List[str]
    target_docs: List[str]

@router.post("/run")
async def run_gap_analysis(request: GapAnalysisRequest):
    try:
        graph = build_gap_analysis_graph()
        
        # Invoke the graph
        result = graph.invoke({
            "baseline_docs": request.baseline_docs,
            "target_docs": request.target_docs,
            "baseline_facts": [],
            "target_facts": [],
            "diff_results": {},
            "final_report": None,
            "errors": []
        })
        
        final_report = result.get("final_report")
        report_data = final_report.model_dump() if final_report else None
        
        return {"status": "success", "report": report_data}
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
