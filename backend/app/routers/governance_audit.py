from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List

from app.agents.governance_audit_agent import build_governance_audit_graph

router = APIRouter(
    prefix="/governance_audit",
    tags=["governance_audit"],
)

class DocumentInput(BaseModel):
    title: str
    text: str

class GovernanceAuditRequest(BaseModel):
    guardrail_docs: List[DocumentInput]
    architecture_docs: List[DocumentInput]
    llm_preset: str = "default"

@router.post("/run")
async def run_governance_audit(request: GovernanceAuditRequest):
    try:
        graph = build_governance_audit_graph()
        
        result = graph.invoke({
            "guardrail_docs": [doc.dict() for doc in request.guardrail_docs],
            "architecture_docs": [doc.dict() for doc in request.architecture_docs],
            "llm_preset": request.llm_preset,
            "parsed_rules": [],
            "violations": [],
            "compliant_rule_ids": [],
            "final_results": {},
            "errors": []
        })
        
        if result.get("errors"):
            raise HTTPException(status_code=500, detail="; ".join(result["errors"]))
            
        return result.get("final_results", {})
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
