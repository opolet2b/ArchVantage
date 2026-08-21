from typing import Optional, TypedDict, List
from sqlalchemy.orm import Session
from app.models.canvas_models import CanvasThing, CanvasLink
from app.models.user import User
from app.schemas.canvas_schemas import AnalyzeRequest, AnalyzeResponse, AnalyzeAction
from app.plugins.registry import PluginRegistry
from langgraph.graph import StateGraph, END
import asyncio
import json

class MemoState(TypedDict):
    documents: List[str]
    extracted_aspects: str
    memo: str

@PluginRegistry.register_analyzer("architecture_memo")
async def generate_architecture_memo(
    request: AnalyzeRequest,
    thing: CanvasThing,
    db: Session,
    current_user: User
) -> Optional[AnalyzeResponse]:
    """
    LangGraph-based Architecture Memo generator.
    """
    is_memo = request.action == AnalyzeAction.ASK and request.custom_prompt and "create a 1-page architecture memo" in request.custom_prompt.lower()
    
    if not is_memo:
        return None

    from app.services.llm_service import llm_service
    from app.routers.canvas import _resolve_active_model

    # 1. Gather linked documents
    links = db.query(CanvasLink).filter(
        (CanvasLink.source_id == thing.id) | (CanvasLink.target_id == thing.id)
    ).all()
    
    linked_ids = set()
    for l in links:
        linked_ids.add(l.source_id)
        linked_ids.add(l.target_id)
    linked_ids.discard(thing.id)
    
    selected_ids_str = request.fragment.content if request.fragment and request.fragment.content else ""
    try:
        if selected_ids_str:
            selected_ids = json.loads(selected_ids_str)
            if isinstance(selected_ids, list):
                linked_ids = linked_ids.intersection(set(selected_ids))
    except json.JSONDecodeError:
        pass
    
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

    if not documents_content:
        return AnalyzeResponse(
            thing_id=request.thing_id,
            action=request.action,
            result="No linked documents found to analyze.",
            created_thing_id=None
        )

    async def extract_aspects(state: MemoState) -> MemoState:
        active_model = _resolve_active_model(db, thing.canvas_id, None)
        
        full_text = "\n\n".join(state["documents"])
        
        # Map-Reduce chunking for full, in-depth coverage
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
                print(f"Failed to process chunk: {e}")
                return ""
        
        # Process in batches of 5 to respect concurrency limits
        batch_size = 5
        all_aspects = []
        for i in range(0, len(chunks), batch_size):
            batch = chunks[i:i + batch_size]
            results = await asyncio.gather(*(process_chunk(c) for c in batch))
            all_aspects.extend([r for r in results if r.strip()])
            
        if not all_aspects:
            raise Exception("Failed to extract aspects from the documents.")
            
        # Combine all extracted aspects
        final_extracted = "\n\n--- Analysis from Excerpt ---\n\n".join(all_aspects)
        return {"extracted_aspects": final_extracted}

    async def write_memo(state: MemoState) -> MemoState:
        aspects = state["extracted_aspects"]
        prompt = f"You are an Enterprise Architect. Based on the following extracted aspects, write a 1-page C-Level architecture memo. It should include an executive summary, analysis of current state, core recommendations, and links to sources (referencing the documents). Make it highly professional and compelling.\n\nCRITICAL INSTRUCTION: Do NOT include a 'To / From / Date / Subject' header at the beginning of the memo. Start directly with the Executive Summary.\n\nExtracted Aspects:\n{aspects}"
        from app.models.chat import Message
        messages = [Message(role="user", content=prompt)]
        active_model = _resolve_active_model(db, thing.canvas_id, None)
        memo = await llm_service.chat(messages=messages, model_name=active_model)
        if memo.startswith("Error:"):
            raise Exception(f"Failed to write memo: {memo}")
        return {"memo": memo}

    # 3. Build Graph
    workflow = StateGraph(MemoState)
    workflow.add_node("extract", extract_aspects)
    workflow.add_node("write", write_memo)
    
    workflow.set_entry_point("extract")
    workflow.add_edge("extract", "write")
    workflow.add_edge("write", END)
    
    app = workflow.compile()
    
    # 4. Execute Graph
    initial_state = MemoState(
        documents=documents_content,
        extracted_aspects="",
        memo=""
    )
    
    print("[ArchitectureMemo Plugin] Starting LangGraph execution...")
    try:
        final_state = await app.ainvoke(initial_state)
        memo_content = final_state["memo"]
    except Exception as e:
        print(f"[ArchitectureMemo Plugin] LangGraph execution failed: {e}")
        import traceback
        traceback.print_exc()
        memo_content = f"Error generating memo: {e}"

    # 5. Return result
    return AnalyzeResponse(
        thing_id=request.thing_id,
        action=request.action,
        result=memo_content,
        created_thing_id=None
    )
