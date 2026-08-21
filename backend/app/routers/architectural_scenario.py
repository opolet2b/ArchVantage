from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import os
import json

import asyncio
from llama_index.core.node_parser import SentenceSplitter
from langchain_core.messages import SystemMessage
from app.services.llm_service import LLMService

from app.agents.architectural_scenario_agent import build_architectural_scenario_graph, build_baseline_extractor_graph, ArchitecturalScenarioResult, ArchitecturalBaseline
from app.core.database import SessionLocal
from app.models.canvas_models import CanvasThing
from app.utils.docx_exporter import generate_scenario_docx

async def condense_architectural_context(raw_text: str, queue: asyncio.Queue = None) -> str:
    # If text is small enough, no need to condense
    if len(raw_text) < 80000:
        if queue:
            await queue.put({'type': 'progress', 'node': 'condense', 'message': 'Document is small, skipping Map-Reduce...', 'percent': 40})
        return raw_text
        
    service = LLMService()
    llm, _ = service._get_model("default")
    
    text_splitter = SentenceSplitter(
        chunk_size=12000,
        chunk_overlap=1000
    )
    chunks = text_splitter.split_text(raw_text)
    
    map_prompt = """You are an Enterprise Architect. Extract all architectural components, systems, actors, dependencies, and rules from the following document text. Be concise, list the entities and relations according to TOGAF layers (Business, Information, Application, Technology). Ignore irrelevant narrative.
    
Document Text:
{text}
"""
    
    async def process_chunk(chunk):
        try:
            res = await llm.ainvoke([SystemMessage(content=map_prompt.replace("{text}", chunk))])
            return res.content
        except Exception as e:
            return f"Error extracting: {e}"

    batch_size = 5
    map_results = []
    total = len(chunks)
    for i in range(0, total, batch_size):
        batch = chunks[i:i+batch_size]
        
        for task in asyncio.as_completed([process_chunk(c) for c in batch]):
            result = await task
            map_results.append(result)
            if queue:
                total_completed = len(map_results)
                pct = 5 + int((total_completed / total) * 55)
                await queue.put({
                    'type': 'progress', 
                    'node': 'condense', 
                    'message': f'Extracted {total_completed} / {total} architecture chunks...', 
                    'percent': pct
                })
        
    return "\n\n--- Architectural Extraction ---\n\n".join(map_results)

router = APIRouter(
    prefix="/architectural_scenario",
    tags=["architectural_scenario"],
)

class IngestRequest(BaseModel):
    document_ids: List[str]
    thing_id: str

@router.post("/ingest-stream")
async def ingest_scenario_stream(request: IngestRequest):
    import threading
    import queue
    import json
    from sqlalchemy.orm.attributes import flag_modified
    
    try:
        with SessionLocal() as db:
            thing = db.query(CanvasThing).filter(CanvasThing.id == request.thing_id).first()
            if thing:
                content = dict(thing.content) if thing.content else {}
                content["archState"] = {"step": "EXTRACTING"}
                thing.content = content
                flag_modified(thing, "content")
                db.commit()
            
            documents_content = []
            for doc_id in request.document_ids:
                doc_thing = db.query(CanvasThing).filter(CanvasThing.id == doc_id).first()
                if doc_thing:
                    content_dict = doc_thing.content or {}
                    if isinstance(content_dict, str):
                        text = content_dict
                    else:
                        text = content_dict.get('text') or content_dict.get('content') or str(content_dict)
                    documents_content.append(text)
    except Exception as e:
        raise HTTPException(status_code=500, detail="Database lock failed")
        
    if not documents_content:
        async def err(): yield f"data: {json.dumps({'type': 'error', 'message': 'No valid documents found'})}\n\n"
        return StreamingResponse(err(), media_type="text/event-stream")

    q = queue.Queue()
    
    def worker():
        async def run_pipeline():
            class AsyncQueueAdapter:
                async def put(self, item):
                    q.put(item)
                    
            try:
                q.put({'type': 'progress', 'node': 'init', 'message': 'Reading documents...', 'percent': 5})
                raw_document_context = "\n\n---\n\n".join(documents_content)
                document_context = await condense_architectural_context(raw_document_context, queue=AsyncQueueAdapter())
                
                q.put({'type': 'progress', 'node': 'baseline', 'message': 'Synthesizing unified baseline architecture...', 'percent': 60})
                
                graph = build_baseline_extractor_graph()
                result = await graph.ainvoke({
                    "document_context": document_context,
                    "baseline": None
                })
                
                baseline: ArchitecturalBaseline = result.get("baseline")
                if not baseline:
                    raise Exception("LLM failed to extract baseline architecture")
                    
                return baseline.model_dump()
            except Exception as e:
                import traceback
                traceback.print_exc()
                raise e
                
        try:
            import asyncio
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            baseline_result = loop.run_until_complete(run_pipeline())
            
            q.put({'type': 'complete', 'result': baseline_result})
            
            try:
                with SessionLocal() as db:
                    thing = db.query(CanvasThing).filter(CanvasThing.id == request.thing_id).first()
                    if thing:
                        if thing.content is None:
                            thing.content = {}
                        thing.content["archState"] = {"step": "DONE"}
                        flag_modified(thing, "content")
                        db.commit()
            except Exception as db_err:
                pass
                
        except Exception as e:
            q.put({'type': 'error', 'message': str(e)})
            try:
                with SessionLocal() as db:
                    thing = db.query(CanvasThing).filter(CanvasThing.id == request.thing_id).first()
                    if thing:
                        if thing.content is None:
                            thing.content = {}
                        thing.content["archState"] = {"step": "WAITING"}
                        flag_modified(thing, "content")
                        db.commit()
            except Exception as db_err:
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

        raw_document_context = "\n\n---\n\n".join(documents_content) if documents_content else "No explicit document context provided."
        document_context = await condense_architectural_context(raw_document_context) if documents_content else raw_document_context

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
    import threading
    import queue
    import json
    from sqlalchemy.orm.attributes import flag_modified

    try:
        with SessionLocal() as db:
            thing = db.query(CanvasThing).filter(CanvasThing.id == request.thing_id).first()
            if thing:
                content = dict(thing.content) if thing.content else {}
                content["archState"] = {"step": "SIMULATING"}
                thing.content = content
                flag_modified(thing, "content")
                db.commit()
            
            documents_content = []
            for doc_id in request.document_ids:
                doc_thing = db.query(CanvasThing).filter(CanvasThing.id == doc_id).first()
                if doc_thing:
                    content_dict = doc_thing.content or {}
                    if isinstance(content_dict, str):
                        text = content_dict
                    else:
                        text = content_dict.get('text') or content_dict.get('content') or str(content_dict)
                    documents_content.append(text)
    except Exception as e:
        raise HTTPException(status_code=500, detail="Database lock failed")

    raw_document_context = "\n\n---\n\n".join(documents_content) if documents_content else "No explicit document context provided."

    q = queue.Queue()

    def worker():
        async def run_simulation():
            class AsyncQueueAdapter:
                async def put(self, item):
                    q.put(item)
                    
            document_context = await condense_architectural_context(raw_document_context, queue=AsyncQueueAdapter()) if documents_content else raw_document_context
            
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
            
            final_state = None
            async for event in graph.astream(initial_state):
                for node_name, node_state in event.items():
                    q.put({'type': 'progress', 'node': node_name})
                    final_state = node_state
            
            if final_state and "result" in final_state:
                sim_result = final_state["result"]
                return sim_result.model_dump()
            else:
                raise Exception("Graph failed to produce a final result")

        try:
            import asyncio
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            sim_result = loop.run_until_complete(run_simulation())
            
            q.put({'type': 'complete', 'result': sim_result})
            
            try:
                with SessionLocal() as db:
                    thing = db.query(CanvasThing).filter(CanvasThing.id == request.thing_id).first()
                    if thing:
                        if thing.content is None:
                            thing.content = {}
                        thing.content["archState"] = {"step": "DONE"}
                        flag_modified(thing, "content")
                        db.commit()
            except Exception as db_err:
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
                        thing.content["archState"] = {"step": "WAITING"}
                        flag_modified(thing, "content")
                        db.commit()
            except Exception as db_err:
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
async def get_arch_status(thing_id: str):
    try:
        with SessionLocal() as db:
            thing = db.query(CanvasThing).filter(CanvasThing.id == thing_id).first()
            if not thing:
                raise HTTPException(status_code=404, detail="Thing not found")
            
            content = thing.content or {}
            archState = content.get("archState", {})
            step = archState.get("step", "WAITING")
            
            return {"step": step}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

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
