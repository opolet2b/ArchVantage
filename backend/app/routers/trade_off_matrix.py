from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import List, Optional
import threading
import queue
import json
import asyncio
import logging

from app.core.database import SessionLocal
from app.models.canvas_models import CanvasThing
from sqlalchemy.orm.attributes import flag_modified

router = APIRouter(
    prefix="/trade_off_matrix",
    tags=["trade_off_matrix"],
)

logger = logging.getLogger("trade_off_matrix")
logger.setLevel(logging.INFO)
if not logger.handlers:
    ch = logging.StreamHandler()
    formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
    ch.setFormatter(formatter)
    logger.addHandler(ch)

class MatrixRequest(BaseModel):
    thing_id: str
    selected_link_ids: List[str]
    canvas_id: str
    methodology: str = "LLM Generated"

@router.post("/generate")
async def generate_trade_off_matrix(request: MatrixRequest):
    logger.info(f"=== Incoming POST /generate request for thing_id: {request.thing_id} ===")
    
    try:
        with SessionLocal() as db:
            thing = db.query(CanvasThing).filter(CanvasThing.id == request.thing_id).first()
            if thing:
                if thing.content is None:
                    thing.content = {}
                thing.content["matrixState"] = {"step": "EXTRACTING"}
                flag_modified(thing, "content")
                db.commit()
            else:
                raise HTTPException(status_code=404, detail="Thing not found")
            
            linked_ids = set(request.selected_link_ids)
            documents = []
            if linked_ids:
                linked_things = db.query(CanvasThing).filter(CanvasThing.id.in_(linked_ids)).all()
                for t in linked_things:
                    title = t.title or t.id
                    asset_id = None
                    if isinstance(t.content, dict):
                        asset_id = t.content.get("asset_id")
                    documents.append({"id": t.id, "title": title, "asset_id": asset_id})

    except Exception as db_err:
        logger.error(f"Failed to set generating state to DB: {db_err}")
        raise HTTPException(status_code=500, detail="Database lock failed")

    q = queue.Queue()
    
    def worker():
        async def process_all():
            from app.services.rag_service import rag_service
            from app.routers.canvas import _resolve_active_model
            
            with SessionLocal() as db_session:
                active_model = _resolve_active_model(db_session, request.canvas_id, None)
                
            methodology = request.methodology
            methodology_instruction = "Generate the domains dynamically based on the document content."
            if methodology != "LLM Generated":
                methodology_instruction = f"Group the decisions into domains according to the {methodology} methodology."

            broad_prompt = f"""Analyze the document for architectural decisions or trade-offs. Return a strictly valid JSON array of Decision Domains. 
{methodology_instruction}
For each domain, list the competing mutually exclusive alternatives. 
For each alternative, extract its Pros, Cons, and the Recommended Fit (or any other appropriate criteria columns discussed).
Format exactly like this JSON structure (Do not use Markdown outside of the JSON):
[
  {{
    "domain": "Storage Infrastructure",
    "criteria_columns": ["Pros", "Cons", "Recommended Fit"],
    "alternatives": [
      {{
        "name": "Direct Attached Storage (DASD)",
        "description": "Simple initial deployment...",
        "evaluations": {{
          "Pros": "Simple initial deployment for isolated servers. No dedicated storage network required.",
          "Cons": "Low storage utilization efficiency. Complex backup operations.",
          "Recommended Fit": "Legacy / Edge Use Only"
        }}
      }}
    ]
  }}
]"""

            all_domains = []
            total_docs = len(documents)
            completed_docs = 0

            async def process_doc(doc):
                search_filters = {}
                if doc["asset_id"]:
                    search_filters["asset_id"] = doc["asset_id"]
                    
                try:
                    results = await asyncio.to_thread(
                        rag_service.search,
                        query=broad_prompt, 
                        k=20, 
                        filters=search_filters, 
                        model_name=active_model, 
                        response_mode="compact"
                    )
                    
                    raw_text = "[]"
                    if results and len(results) > 0 and results[0].get('metadata', {}).get('type') == 'synthesized_response':
                        raw_text = results[0]['text']
                        
                    if '```json' in raw_text:
                        json_str = raw_text.split('```json')[1].split('```')[0].strip()
                    elif '```' in raw_text:
                        json_str = raw_text.split('```')[1].split('```')[0].strip()
                    else:
                        import re
                        match = re.search(r'\[[\s\S]*\]', raw_text)
                        json_str = match.group(0) if match else "[]"
                    
                    domains = json.loads(json_str)
                    if isinstance(domains, list):
                        return domains
                except Exception as e:
                    logger.error(f"Failed to process doc {doc['title']}: {e}")
                return []

            # Process concurrently
            tasks = [process_doc(doc) for doc in documents]
            for f in asyncio.as_completed(tasks):
                res = await f
                all_domains.extend(res)
                completed_docs += 1
                q.put({"type": "chunk_progress", "completed": completed_docs, "total": total_docs})

            # Format to spreadsheet data
            data = []
            for domainData in all_domains:
                domainName = domainData.get("domain", "General Domain")
                criteriaColumns = domainData.get("criteria_columns", ["Pros", "Cons", "Recommended Fit"])
                alternatives = domainData.get("alternatives", [])
                
                data.append([f"Domain: {domainName}"] + [""] * len(criteriaColumns))
                data.append(["Alternative"] + criteriaColumns)
                
                for alt in alternatives:
                    evals = alt.get("evaluations", {})
                    evalRow = [evals.get(c, "TBD") for c in criteriaColumns]
                    data.append([alt.get("name", "Unknown")] + evalRow)
                    
                data.append([""] + [""] * len(criteriaColumns))
                
            if data and data[-1][0] == "":
                data.pop()
                
            return data

        try:
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            spreadsheet_data = loop.run_until_complete(process_all())
            
            q.put({"type": "completed", "data": spreadsheet_data})
            
            try:
                with SessionLocal() as db:
                    thing = db.query(CanvasThing).filter(CanvasThing.id == request.thing_id).first()
                    if thing:
                        if thing.content is None:
                            thing.content = {}
                        thing.content["matrixState"] = {"step": "EDITING"}
                        thing.content["data"] = spreadsheet_data
                        flag_modified(thing, "content")
                        db.commit()
            except Exception as db_err:
                logger.error(f"Failed to save to DB: {db_err}")
                
        except Exception as e:
            logger.error(f"Background worker CRASHED: {e}")
            q.put({"type": "error", "message": str(e)})
            try:
                with SessionLocal() as db:
                    thing = db.query(CanvasThing).filter(CanvasThing.id == request.thing_id).first()
                    if thing:
                        if thing.content is None:
                            thing.content = {}
                        thing.content["matrixState"] = {"step": "WAITING"}
                        flag_modified(thing, "content")
                        db.commit()
            except Exception as db_err:
                pass
        
        q.put({"type": "done"})

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
async def get_matrix_status(thing_id: str):
    try:
        with SessionLocal() as db:
            thing = db.query(CanvasThing).filter(CanvasThing.id == thing_id).first()
            if not thing:
                raise HTTPException(status_code=404, detail="Thing not found")
            
            content = thing.content or {}
            matrixState = content.get("matrixState", {})
            step = matrixState.get("step", "WAITING")
            
            return {
                "step": step,
                "data": content.get("data", [])
            }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
