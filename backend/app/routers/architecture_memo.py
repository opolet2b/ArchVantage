from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import List, Optional
import threading
import queue
import json
import asyncio
import logging
from langgraph.graph import StateGraph, END
from typing import TypedDict

from app.core.database import SessionLocal
from app.models.canvas_models import CanvasThing, CanvasLink
from sqlalchemy.orm.attributes import flag_modified

router = APIRouter(
    prefix="/architecture_memo",
    tags=["architecture_memo"],
)

logger = logging.getLogger("architecture_memo")
logger.setLevel(logging.INFO)
if not logger.handlers:
    ch = logging.StreamHandler()
    formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
    ch.setFormatter(formatter)
    logger.addHandler(ch)

class MemoRequest(BaseModel):
    thing_id: str
    selected_link_ids: List[str]
    canvas_id: str

class MemoState(TypedDict):
    documents: List[str]
    extracted_aspects: str
    memo: str

@router.post("/generate")
async def generate_architecture_memo(request: MemoRequest):
    logger.info(f"=== Incoming POST /generate request for thing_id: {request.thing_id} ===")
    
    try:
        with SessionLocal() as db:
            thing = db.query(CanvasThing).filter(CanvasThing.id == request.thing_id).first()
            if thing:
                if thing.content is None:
                    thing.content = {}
                thing.content["memoState"] = {"step": "GENERATING"}
                flag_modified(thing, "content")
                db.commit()
                logger.info(f"Successfully locked DB status to 'GENERATING' for thing {request.thing_id}")
            else:
                logger.warning(f"Could not find CanvasThing with id {request.thing_id} to lock status!")
                raise HTTPException(status_code=404, detail="Thing not found")
            
            # Fetch the documents to analyze
            linked_ids = set(request.selected_link_ids)
            documents_content = []
            if linked_ids:
                linked_things = db.query(CanvasThing).filter(CanvasThing.id.in_(linked_ids)).all()
                for t in linked_things:
                    title = t.title or t.id
                    content = ""
                    if isinstance(t.content, dict):
                        content = t.content.get("text", "") or str(t.content)
                    elif isinstance(t.content, str):
                        content = t.content
                    documents_content.append(f"--- Document: {title} ---\n{content}")

    except Exception as db_err:
        logger.error(f"Failed to set generating state to DB: {db_err}")
        raise HTTPException(status_code=500, detail="Database lock failed")

    q = queue.Queue()
    
    def worker():
        logger.info(f"Background worker thread started for thing_id: {request.thing_id}")
        
        # Build the graph inside the worker thread
        async def run_graph():
            from app.services.llm_service import llm_service
            from app.routers.canvas import _resolve_active_model
            
            async def extract_aspects(state: MemoState) -> MemoState:
                q.put({"type": "step", "node": "extract_aspects"})
                with SessionLocal() as db_session:
                    active_model = _resolve_active_model(db_session, request.canvas_id, None)
                
                full_text = "\n\n".join(state["documents"])
                if not full_text.strip():
                    return {"extracted_aspects": "No context provided."}
                
                chunk_size = 15000
                chunks = [full_text[i:i + chunk_size] for i in range(0, len(full_text), chunk_size)]
                
                from app.models.chat import Message
                
                async def process_chunk(chunk: str) -> str:
                    prompt = f"Analyze the following architectural document excerpt and extract the core aspects, trade-offs, and key decisions. Focus on strategic and technical implications. Be highly specific and concise.\n\nExcerpt:\n{chunk}"
                    messages = [Message(role="user", content=prompt)]
                    try:
                        res = await llm_service.chat(messages=messages, model_name=active_model)
                        if res.startswith("Error:"):
                            return ""
                        return res
                    except Exception as e:
                        logger.error(f"Failed to process chunk: {e}")
                        return ""
                
                batch_size = 5
                all_aspects = []
                completed_chunks = 0
                total_chunks = len(chunks)
                
                for i in range(0, len(chunks), batch_size):
                    batch = chunks[i:i + batch_size]
                    results = await asyncio.gather(*(process_chunk(c) for c in batch))
                    all_aspects.extend([r for r in results if r.strip()])
                    completed_chunks += len(batch)
                    q.put({"type": "chunk_progress", "completed": completed_chunks, "total": total_chunks})
                    
                if not all_aspects:
                    raise Exception("Failed to extract aspects from the documents.")
                    
                final_extracted = "\n\n--- Analysis from Excerpt ---\n\n".join(all_aspects)
                return {"extracted_aspects": final_extracted}

            async def write_memo(state: MemoState) -> MemoState:
                q.put({"type": "step", "node": "write_memo"})
                aspects = state["extracted_aspects"]
                prompt = f"You are an Enterprise Architect. Based on the following extracted aspects, write a 1-page C-Level architecture memo. It should include an executive summary, analysis of current state, core recommendations, and links to sources (referencing the documents). Make it highly professional and compelling.\n\nCRITICAL INSTRUCTION: Do NOT include a 'To / From / Date / Subject' header at the beginning of the memo. Start directly with the Executive Summary.\n\nExtracted Aspects:\n{aspects}"
                from app.models.chat import Message
                messages = [Message(role="user", content=prompt)]
                with SessionLocal() as db_session:
                    active_model = _resolve_active_model(db_session, request.canvas_id, None)
                memo = await llm_service.chat(messages=messages, model_name=active_model)
                if memo.startswith("Error:"):
                    raise Exception(f"Failed to write memo: {memo}")
                return {"memo": memo}

            workflow = StateGraph(MemoState)
            workflow.add_node("extract", extract_aspects)
            workflow.add_node("write", write_memo)
            workflow.set_entry_point("extract")
            workflow.add_edge("extract", "write")
            workflow.add_edge("write", END)
            
            app = workflow.compile()
            
            initial_state = MemoState(
                documents=documents_content,
                extracted_aspects="",
                memo=""
            )
            
            final_state = await app.ainvoke(initial_state)
            return final_state["memo"]

        try:
            # We are in a synchronous thread, so we must create an event loop
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            memo_content = loop.run_until_complete(run_graph())
            
            q.put({"type": "completed", "memoContent": memo_content})
            logger.info(f"Graph completely finished for thing_id: {request.thing_id}")
            
            try:
                with SessionLocal() as db:
                    thing = db.query(CanvasThing).filter(CanvasThing.id == request.thing_id).first()
                    if thing:
                        if thing.content is None:
                            thing.content = {}
                        thing.content["memoState"] = {"step": "DONE"}
                        thing.content["memoContent"] = memo_content
                        flag_modified(thing, "content")
                        db.commit()
                        logger.info(f"Successfully saved final memo and 'DONE' status to DB for thing {request.thing_id}")
            except Exception as db_err:
                logger.error(f"Failed to save to DB: {db_err}")
                
        except Exception as e:
            import traceback
            logger.error(f"Background worker CRASHED for thing_id: {request.thing_id}. Exception: {e}")
            logger.error(traceback.format_exc())
            q.put({"type": "error", "message": str(e)})
            
            try:
                with SessionLocal() as db:
                    thing = db.query(CanvasThing).filter(CanvasThing.id == request.thing_id).first()
                    if thing:
                        if thing.content is None:
                            thing.content = {}
                        thing.content["memoState"] = {"step": "WAITING"}
                        flag_modified(thing, "content")
                        db.commit()
                        logger.info(f"Successfully reset DB status to 'WAITING' after crash for thing {request.thing_id}")
            except Exception as db_err:
                logger.error(f"Failed to save error state 'WAITING' to DB: {db_err}")
        
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
async def get_memo_status(thing_id: str):
    try:
        with SessionLocal() as db:
            thing = db.query(CanvasThing).filter(CanvasThing.id == thing_id).first()
            if not thing:
                raise HTTPException(status_code=404, detail="Thing not found")
            
            content = thing.content or {}
            memoState = content.get("memoState", {})
            step = memoState.get("step", "WAITING")
            
            logger.info(f"Status check for thing {thing_id}: returning status '{step}'")
            
            return {
                "step": step,
                "memoContent": content.get("memoContent")
            }
    except Exception as e:
        logger.error(f"Status check failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))
