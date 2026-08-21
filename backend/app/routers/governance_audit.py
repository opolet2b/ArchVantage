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
    thing_id: str
    guardrail_docs: List[DocumentInput]
    architecture_docs: List[DocumentInput]
    llm_preset: str = "default"

@router.post("/run-stream")
async def run_governance_audit_stream(request: GovernanceAuditRequest):
    import threading
    import queue
    import json
    from sqlalchemy.orm.attributes import flag_modified
    from fastapi.responses import StreamingResponse
    from app.core.database import SessionLocal
    from app.models.canvas_models import CanvasThing
    
    try:
        with SessionLocal() as db:
            thing = db.query(CanvasThing).filter(CanvasThing.id == request.thing_id).first()
            if thing:
                content = dict(thing.content) if thing.content else {}
                content["auditState"] = {"step": "ANALYZING"}
                thing.content = content
                flag_modified(thing, "content")
                db.commit()
    except Exception as e:
        raise HTTPException(status_code=500, detail="Database lock failed")

    q = queue.Queue()

    def worker():
        try:
            q.put({'type': 'progress', 'message': 'Initializing governance audit...'})
            
            graph = build_governance_audit_graph()
            
            # Since the graph might not be designed for streaming progress, we'll run it synchronously
            # but provide regular heartbeat if possible, or just wait for the result.
            q.put({'type': 'progress', 'message': 'Analyzing architecture against guardrails...'})
            
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
                raise Exception("; ".join(result["errors"]))
                
            final_results = result.get("final_results", {})
            q.put({'type': 'complete', 'result': final_results})
            
            try:
                with SessionLocal() as db:
                    thing = db.query(CanvasThing).filter(CanvasThing.id == request.thing_id).first()
                    if thing:
                        if thing.content is None:
                            thing.content = {}
                        thing.content["auditState"] = {"step": "DONE"}
                        flag_modified(thing, "content")
                        db.commit()
            except Exception:
                pass
                
        except Exception as e:
            import traceback
            traceback.print_exc()
            q.put({'type': 'error', 'message': str(e)})
            try:
                with SessionLocal() as db:
                    thing = db.query(CanvasThing).filter(CanvasThing.id == request.thing_id).first()
                    if thing:
                        if thing.content is None:
                            thing.content = {}
                        thing.content["auditState"] = {"step": "WAITING"}
                        flag_modified(thing, "content")
                        db.commit()
            except Exception:
                pass
                
        q.put({"type": "done"})

    threading.Thread(target=worker, daemon=True).start()

    async def event_stream():
        import asyncio
        while True:
            try:
                msg = await asyncio.to_thread(q.get, timeout=0.1)
                if msg["type"] == "done":
                    break
                yield f"data: {json.dumps(msg)}\n\n"
                if msg["type"] in ["error", "complete"]:
                    break
            except queue.Empty:
                yield ": keep-alive\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")

@router.get("/status/{thing_id}")
async def get_audit_status(thing_id: str):
    from app.core.database import SessionLocal
    from app.models.canvas_models import CanvasThing
    
    try:
        with SessionLocal() as db:
            thing = db.query(CanvasThing).filter(CanvasThing.id == thing_id).first()
            if not thing:
                raise HTTPException(status_code=404, detail="Thing not found")
            
            content = thing.content or {}
            auditState = content.get("auditState", {})
            step = auditState.get("step", "WAITING")
            
            return {"step": step}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
