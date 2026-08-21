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

router = APIRouter(
    prefix="/time_matrix",
    tags=["time_matrix"],
)

logger = logging.getLogger("time_matrix")
logger.setLevel(logging.INFO)
if not logger.handlers:
    ch = logging.StreamHandler()
    formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
    ch.setFormatter(formatter)
    logger.addHandler(ch)

class TimeMatrixRequest(BaseModel):
    thing_id: str
    selected_link_ids: List[str]
    canvas_id: str

@router.post("/generate")
async def generate_time_matrix(request: TimeMatrixRequest):
    logger.info(f"=== Incoming POST /generate request for thing_id: {request.thing_id} ===")
    
    try:
        with SessionLocal() as db:
            thing = db.query(CanvasThing).filter(CanvasThing.id == request.thing_id).first()
            if thing:
                # Properly re-assign the JSON column for SQLAlchemy detection
                content = dict(thing.content) if thing.content else {}
                content["timeState"] = {"step": "EXTRACTING"}
                thing.content = content
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
                
            prompt = """You are an Enterprise Architect AI. Your task is to extract Application Portfolio data from the entire document to build a TIME Matrix (Tolerate, Invest, Migrate, Eliminate).
CRITICAL RULES:
1. Identify all software applications mentioned.
2. Extract or estimate 'Technical Health' (0 to 10) based on code quality, modern stack, etc.
3. Extract or estimate 'Business Value' (0 to 10) based on alignment, criticality, usage.
4. Extract 'runCost' as a numeric value if available (e.g., license fees).
5. Extract 'riskProfile' (e.g., SLA breaches, compliance issues).
6. Determine 'quadrant' strictly by these rules:
   - High Tech (>=5) + High Value (>=5) = Invest
   - Low Tech (<5) + High Value (>=5) = Migrate
   - High Tech (>=5) + Low Value (<5) = Tolerate
   - Low Tech (<5) + Low Value (<5) = Eliminate
7. Include 'citations' (exact snippets from text justifying the scores).

Return a strictly valid JSON array of objects. Each object MUST have: id (string), name (string), technicalHealth (number), businessValue (number), runCost (number), riskProfile (string), quadrant (string), citations (array of strings). Only return the JSON array."""

            all_apps = []
            total_docs = len(documents)
            completed_docs = 0

            async def process_doc(doc):
                search_filters = {}
                if doc["asset_id"]:
                    search_filters["asset_id"] = doc["asset_id"]
                    
                try:
                    results = await asyncio.to_thread(
                        rag_service.search,
                        query=prompt, 
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
                    
                    apps = json.loads(json_str)
                    if isinstance(apps, list):
                        return apps
                except Exception as e:
                    logger.error(f"Failed to process doc {doc['title']}: {e}")
                return []

            # Process concurrently
            tasks = [process_doc(doc) for doc in documents]
            for f in asyncio.as_completed(tasks):
                res = await f
                all_apps.extend(res)
                completed_docs += 1
                q.put({"type": "chunk_progress", "completed": completed_docs, "total": total_docs})
                
            unique_apps_map = {}
            import random
            for app in all_apps:
                name = str(app.get("name", "")).lower().strip()
                app_id = str(app.get("id", ""))
                dedupe_key = name or app_id
                
                if dedupe_key not in unique_apps_map:
                    # Give it a guaranteed unique ID for React mapping
                    app["id"] = f"{app_id}-{random.randint(1000, 9999)}"
                    unique_apps_map[dedupe_key] = app
                else:
                    existing = unique_apps_map[dedupe_key]
                    if app.get("citations"):
                        existing_citations = existing.get("citations", [])
                        existing_citations.extend(app["citations"])
                        existing["citations"] = list(set(existing_citations))
            
            return list(unique_apps_map.values())

        try:
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            final_apps = loop.run_until_complete(process_all())
            
            q.put({"type": "completed", "apps": final_apps})
            
            try:
                with SessionLocal() as db:
                    thing = db.query(CanvasThing).filter(CanvasThing.id == request.thing_id).first()
                    if thing:
                        if thing.content is None:
                            thing.content = {}
                        thing.content["timeState"] = {"step": "READY", "apps": final_apps}
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
                        thing.content["timeState"] = {"step": "WAITING"}
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
async def get_time_matrix_status(thing_id: str):
    try:
        with SessionLocal() as db:
            thing = db.query(CanvasThing).filter(CanvasThing.id == thing_id).first()
            if not thing:
                raise HTTPException(status_code=404, detail="Thing not found")
            
            content = thing.content or {}
            timeState = content.get("timeState", {})
            step = timeState.get("step", "WAITING")
            
            return {
                "step": step,
                "apps": timeState.get("apps", [])
            }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
