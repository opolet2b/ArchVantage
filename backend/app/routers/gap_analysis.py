from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import List
import threading
import queue
import json
import asyncio
import logging

from app.core.database import SessionLocal
from app.models.canvas_models import CanvasThing
from sqlalchemy.orm.attributes import flag_modified

from app.agents.gap_analysis_agent import build_gap_analysis_graph

router = APIRouter(
    prefix="/gap_analysis",
    tags=["gap_analysis"],
)

logger = logging.getLogger("gap_analysis")
logger.setLevel(logging.INFO)
if not logger.handlers:
    ch = logging.StreamHandler()
    formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
    ch.setFormatter(formatter)
    logger.addHandler(ch)

class GapAnalysisRequest(BaseModel):
    thing_id: str = None
    baseline_docs: List[str]
    target_docs: List[str]
    llm_preset: str = "default"

@router.post("/run")
async def run_gap_analysis(request: GapAnalysisRequest):
    logger.info(f"=== Incoming POST /run request for thing_id: {request.thing_id} ===")
    
    if request.thing_id:
        try:
            with SessionLocal() as db:
                thing = db.query(CanvasThing).filter(CanvasThing.id == request.thing_id).first()
                if thing:
                    if thing.content is None:
                        thing.content = {}
                    thing.content["status"] = "generating"
                    flag_modified(thing, "content")
                    db.commit()
                    logger.info(f"Successfully locked DB status to 'generating' for thing {request.thing_id}")
                else:
                    logger.warning(f"Could not find CanvasThing with id {request.thing_id} to lock status!")
        except Exception as db_err:
            logger.error(f"Failed to set generating state to DB: {db_err}")

    q = queue.Queue()
    
    def progress_callback(completed, total):
        q.put({"type": "chunk_progress", "completed": completed, "total": total})
        
    def worker():
        logger.info(f"Background worker thread started for thing_id: {request.thing_id}")
        try:
            graph = build_gap_analysis_graph()
            
            final_report = None
            
            # Start streaming events from the graph
            for event in graph.stream({
                "baseline_docs": request.baseline_docs,
                "target_docs": request.target_docs,
                "llm_preset": request.llm_preset,
                "baseline_facts": [],
                "target_facts": [],
                "diff_results": {},
                "final_report": None,
                "errors": [],
                "progress_callback": progress_callback
            }):
                node_name = list(event.keys())[0] if event else "unknown"
                q.put({"type": "step", "node": node_name})
                logger.info(f"Graph reached node: {node_name} for thing_id: {request.thing_id}")
                
                # Check for final report
                if node_name == "gap_report_generator":
                    logger.info(f"Report generator finished for thing_id: {request.thing_id}.")
                    report_obj = event["gap_report_generator"].get("final_report")
                    if report_obj:
                        final_report = report_obj.model_dump()
                        q.put({"type": "completed", "report": final_report})
            
            q.put({"type": "done"})
            logger.info(f"Graph completely finished for thing_id: {request.thing_id}")
            
            if request.thing_id:
                try:
                    with SessionLocal() as db:
                        thing = db.query(CanvasThing).filter(CanvasThing.id == request.thing_id).first()
                        if thing:
                            if thing.content is None:
                                thing.content = {}
                            thing.content["status"] = "completed"
                            if final_report:
                                thing.content["report"] = final_report
                            flag_modified(thing, "content")
                            db.commit()
                            logger.info(f"Successfully saved final report and 'completed' status to DB for thing {request.thing_id}")
                except Exception as db_err:
                    logger.error(f"Failed to save to DB: {db_err}")
                    
        except Exception as e:
            import traceback
            logger.error(f"Background worker CRASHED for thing_id: {request.thing_id}. Exception: {e}")
            logger.error(traceback.format_exc())
            q.put({"type": "error", "message": str(e)})
            
            if request.thing_id:
                try:
                    with SessionLocal() as db:
                        thing = db.query(CanvasThing).filter(CanvasThing.id == request.thing_id).first()
                        if thing:
                            if thing.content is None:
                                thing.content = {}
                            thing.content["status"] = "idle"
                            flag_modified(thing, "content")
                            db.commit()
                            logger.info(f"Successfully reset DB status to 'idle' after crash for thing {request.thing_id}")
                except Exception as db_err:
                    logger.error(f"Failed to save error state 'idle' to DB: {db_err}")

    threading.Thread(target=worker, daemon=True).start()

    async def event_stream():
        while True:
            try:
                msg = await asyncio.to_thread(q.get, timeout=0.1)
                yield f"data: {json.dumps(msg)}\n\n"
                if msg["type"] in ["done", "error", "completed"]:
                    break
            except queue.Empty:
                yield ": keep-alive\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")

@router.get("/status/{thing_id}")
async def get_gap_analysis_status(thing_id: str):
    try:
        with SessionLocal() as db:
            thing = db.query(CanvasThing).filter(CanvasThing.id == thing_id).first()
            if not thing:
                raise HTTPException(status_code=404, detail="Thing not found")
            
            status = thing.content.get("status", "idle") if thing.content else "idle"
            logger.info(f"Status check for thing {thing_id}: returning status '{status}'")
            
            return {
                "status": status,
                "report": thing.content.get("report") if thing.content else None
            }
    except Exception as e:
        logger.error(f"Status check failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))
