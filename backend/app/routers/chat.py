"""
Chat Router

API endpoints for chat functionality including agent matching and execution.
"""
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from app.models.chat import (
    ChatRequest, ChatResponse,
    AgentMatchRequest, AgentMatchResponse, AgentMatchResult,
    AgentExecuteFromChatRequest, AgentExecuteFromChatResponse
)
from app.core.database import get_db
from app.routers.auth import get_current_active_user
from app.models.user import User
from app.services.llm_service import llm_service
from app.services.agent_matcher import agent_matcher
from app.services.agent_runtime import execute_blueprint
from app.models.agent_blueprint import AgentBlueprint


router = APIRouter()


def resolve_conversation_context(db: Session, conversation_id: str, last_user_message: str = "") -> dict:
    """
    Helper to resolve context for a conversation.
    Returns a dict with:
      - nodes: List[NodeWithScore] (LlamaIndex nodes for synthesis)
      - manifest_text: The text list of items found
      - linked_items: List of items found metadata
      - citations: List of items for frontend
      - debug_log: List of strings describing what happened
    """
    from app.models.canvas_models import CanvasThing, CanvasLink, Domain
    from sqlalchemy import or_
    from app.services.rag_service import rag_service
    from llama_index.core.schema import NodeWithScore, TextNode
    
    debug_log = []
    debug_log.append(f"Resolving context for {conversation_id}")
    
    # 1. Find Conversation Node
    candidates = db.query(CanvasThing).filter(CanvasThing.type == "conversation").all()
    convo_node = next((t for t in candidates if str(t.content.get("conversation_id")) == conversation_id), None)
    
    linked_ids = set()
    linked_items_summary = []
    nodes = [] # Collect NodeWithScore here
    
    if convo_node:
        debug_log.append(f"Found conversation node: {convo_node.id}")
        
        # 2. Find Linked Nodes
        links = db.query(CanvasLink).filter(
            or_(
                CanvasLink.source_id == convo_node.id,
                CanvasLink.target_id == convo_node.id
            )
        ).all()
        
        for link in links:
            target_id = link.target_id if link.source_id == convo_node.id else link.source_id
            linked_ids.add(target_id)
            
        # 2a. Domain Context
        if convo_node.domain_id:
            debug_log.append(f"Conversation is in domain: {convo_node.domain_id}")
            def get_descendant_domain_ids(root_id):
                descendants = set([root_id])
                children = db.query(Domain).filter(Domain.parent_id == root_id).all()
                for child in children:
                    descendants.update(get_descendant_domain_ids(child.id))
                return descendants
            
            domain_ids = get_descendant_domain_ids(convo_node.domain_id)
            domain_things = db.query(CanvasThing).filter(
                CanvasThing.domain_id.in_(domain_ids),
                CanvasThing.id != convo_node.id
            ).all()
            for t in domain_things:
                linked_ids.add(t.id)

        # 2b. Linked Domains Context
        linked_domains = db.query(Domain).filter(Domain.id.in_(list(linked_ids))).all()
        if linked_domains:
             debug_log.append(f"Found {len(linked_domains)} explicitly linked domains.")
             for domain in linked_domains:
                 def get_descendant_domain_ids_local(root_id):
                    descendants = set([root_id])
                    children = db.query(Domain).filter(Domain.parent_id == root_id).all()
                    for child in children:
                        descendants.update(get_descendant_domain_ids_local(child.id))
                    return descendants

                 domain_tree_ids = get_descendant_domain_ids_local(domain.id)
                 domain_children = db.query(CanvasThing).filter(
                    CanvasThing.domain_id.in_(domain_tree_ids),
                     CanvasThing.id != convo_node.id
                 ).all()
                 
                 debug_log.append(f"Added {len(domain_children)} items from linked domain {domain.name}")
                 for child in domain_children:
                     linked_ids.add(child.id)

        # 3. Global Fallback
        if len(linked_ids) == 0:
            debug_log.append("No specific context linked. Falling back to Global Canvas Context")
            all_things = db.query(CanvasThing).filter(
                CanvasThing.canvas_id == convo_node.canvas_id,
                CanvasThing.id != convo_node.id
            ).all()
            for t in all_things:
                linked_ids.add(t.id)

        if linked_ids:
            linked_nodes = db.query(CanvasThing).filter(CanvasThing.id.in_(list(linked_ids))).all()
            debug_log.append(f"Found {len(linked_nodes)} linked context nodes.")
            
            rag_candidates = []
            used_citation_ids = set()
            
            for node in linked_nodes:
                linked_items_summary.append({"id": node.id, "title": node.title, "type": node.type})
                
                if node.content.get("asset_id"):
                    rag_candidates.append({"thing_id": node.id, "asset_id": node.content["asset_id"]})
                
                # Capture Text Context as TextNodes
                if node.type in ["text", "message", "agent_result", "url"]:
                    txt = node.content.get("text") or node.content.get("content") or ""
                    if txt:
                        nodes.append(NodeWithScore(
                            node=TextNode(
                                text=f"[{node.title or 'Note'}]: {txt}", 
                                metadata={"thing_id": node.id, "type": node.type}
                            ),
                            score=1.0
                        ))
                        
                if node.content.get("generated_description"):
                    nodes.append(NodeWithScore(
                        node=TextNode(
                            text=f"[Image Description: {node.title}]: {node.content['generated_description']}",
                            metadata={"thing_id": node.id, "type": "image"}
                        ),
                        score=1.0
                    ))

            # A. Retrieve from RAG for Assets
            if rag_candidates:
                # Determine query string
                query = last_user_message if last_user_message else "Summary"
                debug_log.append(f"Querying RAG for {len(rag_candidates)} candidates with query: '{query}'")
                
                for cand in rag_candidates:
                    tid = cand["thing_id"]
                    results = rag_service.search(query, filters={"thing_id": tid}, k=3)
                    
                    if results:
                        used_citation_ids.add(tid)
                        for res in results:
                            nodes.append(NodeWithScore(
                                node=TextNode(text=res['text'], metadata=res.get('metadata', {})),
                                score=res.get('score', 1.0)
                            ))
                    else:
                        # Fallback
                        fallback_results = rag_service.search(
                            "Summary Introduction Abstract", filters={"thing_id": tid}, k=2
                        )
                        if fallback_results:
                            used_citation_ids.add(tid)
                            for res in fallback_results:
                                nodes.append(NodeWithScore(
                                    node=TextNode(text=res['text'], metadata=res.get('metadata', {})),
                                    score=res.get('score', 0.8)
                                ))

            # B. Add Raw Text Context
            for node in linked_nodes:
                 if node.type == "document" and node.content.get("content"):
                      nodes.append(NodeWithScore(
                          node=TextNode(
                              text=f"[{node.title}]: {node.content['content']}",
                              metadata={"thing_id": node.id, "type": "document"}
                          ),
                          score=1.0
                      ))


            # C. Generate Context Manifest
            manifest_text = "You have access to the following context items:\n"
            for node in linked_nodes:
                 manifest_text += f"- {node.title} ({node.type})\n"

            # D. Inject Graph Relationships
            if linked_ids:
                relevant_links = db.query(CanvasLink).filter(
                    CanvasLink.source_id.in_(list(linked_ids)),
                    CanvasLink.target_id.in_(list(linked_ids))
                ).all()
                
                if relevant_links:
                    rel_text = "\nKNOWN RELATIONSHIPS:\n"
                    id_to_title = {n.id: n.title or "Untitled" for n in linked_nodes}
                    
                    linked_domains = db.query(Domain).filter(Domain.id.in_(list(linked_ids))).all()
                    for d in linked_domains:
                        id_to_title[d.id] = d.name
                    
                    for link in relevant_links:
                        src = id_to_title.get(link.source_id, "Unknown")
                        tgt = id_to_title.get(link.target_id, "Unknown")
                        res = link.type.value
                        if link.label: res += f": \"{link.label}\""
                        if link.description: res += f" ({link.description})"
                        rel_text += f"- \"{src}\" --[{res}]--> \"{tgt}\"\n"
                    
                    # Add relationships as a special node
                    nodes.append(NodeWithScore(
                        node=TextNode(text=rel_text, metadata={"type": "relationships"}),
                        score=1.0
                    ))

            citations = []
            for tid in used_citation_ids:
                # Find original node wrapper
                original_node = next((n for n in linked_nodes if n.id == tid), None)
                if not original_node: continue
                
                citation = {
                    "id": original_node.id, 
                    "title": original_node.title or "Untitled", 
                    "type": original_node.type,
                    "matches": []
                }
                
                # Find all RAG chunks for this citation ID
                rag_matches = [
                    n for n in nodes 
                    if n.node.metadata.get("thing_id") == tid 
                    and n.node.metadata.get("type") not in ["relationships", "image"] # Exclude special types
                ]
                
                # Deduplicate matches based on text content
                seen_texts = set()
                for m in rag_matches:
                    snippet = m.node.get_content()
                    if snippet in seen_texts: continue
                    seen_texts.add(snippet)
                    
                    match_data = {
                        "text": snippet,
                        "score": m.score,
                        "page": m.node.metadata.get("page_label"),    # PDF Page
                        "bbox": m.node.metadata.get("bbox"),          # Visual Grounding [x,y,w,h]
                        "row_id": m.node.metadata.get("row_id")       # Table Row
                    }
                    citation["matches"].append(match_data)
                    
                citations.append(citation)

            return {
                "nodes": nodes,
                "manifest_text": manifest_text,
                "linked_items": linked_items_summary,
                "citations": citations,
                "debug_log": debug_log
            }
            
    return {
        "nodes": [], 
        "manifest_text": None,
        "linked_items": [], 
        "citations": [],
        "debug_log": debug_log
    }

@router.get("/chat/context/{conversation_id}")
async def debug_chat_context(
    conversation_id: str,
    db: Session = Depends(get_db)
):
    """Debug endpoint to see what context is resolved for a conversation ID."""
    from app.services.rag_service import rag_service
    
    result = resolve_conversation_context(db, conversation_id, "DEBUG_TEST")
    
    # Debug the fallback logic too
    if not result.get("linked_items"):
        direct_results = rag_service.search("DEBUG_TEST", conversation_id=conversation_id, k=3, response_mode="simple")
        result["fallback_rag_results"] = direct_results
        result["fallback_message"] = f"Found {len(direct_results)} items via direct RAG search"
        
    return result
        
    return result

@router.post("/chat", response_model=ChatResponse)
async def chat_endpoint(
    request: ChatRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Standard chat endpoint with LlamaIndex-native context management.
    """
    from app.services.rag_service import rag_service
    from llama_index.core import get_response_synthesizer
    from llama_index.core.schema import NodeWithScore, TextNode
    
    final_messages = list(request.messages)
    last_msg = ""
    for m in reversed(request.messages):
        if m.role == "user":
            last_msg = m.content
            break

    # Detect active model/preset
    active_model = request.model
    if active_model == "default" and request.conversation_id:
        # Check if the canvas has a preferred model set in owner_config
        from app.models.canvas_models import CanvasThing, Canvas
        
        # Portable JSON filtering: pull candidates and filter in Python to avoid DB-specific JSON syntax issues
        candidates = db.query(CanvasThing).filter(CanvasThing.type == "conversation").all()
        convo_thing = next((t for t in candidates if str(t.content.get("conversation_id")) == request.conversation_id), None)
        if convo_thing and convo_thing.canvas_id:
            canvas = db.query(Canvas).filter(Canvas.id == convo_thing.canvas_id).first()
            if canvas and canvas.owner_config and canvas.owner_config.get("selected_preset"):
                active_model = canvas.owner_config["selected_preset"]
                print(f"[Chat] Using canvas-specific preset: {active_model}")

    # --- KB Context Enrichment ---
    from app.services.context_enrichment_service import context_enrichment_service
    kb_context = await context_enrichment_service.enrich_context(last_msg, request.kb_id, db, active_model)
    if kb_context:
        # Augment the last message content with the KB context
        for m in reversed(final_messages):
            if m.role == "user":
                m.content = f"{kb_context}\n\nQuestion: {last_msg}"
                last_msg = m.content
                break

    total_nodes = []
    citations = []

    if request.conversation_id:
        # Resolve Canvas Context (Nodes)
        ctx_result = resolve_conversation_context(db, request.conversation_id, last_msg)
        total_nodes.extend(ctx_result.get("nodes", []))
        citations = ctx_result.get("citations", [])
        
        # FALLBACK: Check for direct RAG content
        if not ctx_result.get("linked_items"):
            direct_results = rag_service.search(last_msg, conversation_id=request.conversation_id, k=3)
            for res in direct_results:
                total_nodes.append(NodeWithScore(
                    node=TextNode(text=res['text'], metadata=res.get('metadata', {})),
                    score=res.get('score', 1.0)
                ))
    else:
        # Sidebar Generic Fallback
        results = rag_service.search(last_msg, filters={"owner_id": current_user.id, "source": "sidebar_upload"}, k=3)
        for res in results:
            total_nodes.append(NodeWithScore(
                node=TextNode(text=res['text'], metadata=res.get('metadata', {})),
                score=res.get('score', 1.0)
            ))


    if total_nodes:
        # Use LlamaIndex Response Synthesizer to handle token budgeting
        # 'compact' mode packs as many nodes as possible, and iterates if they don't fit.
        from llama_index.core import Settings, get_response_synthesizer, PromptHelper
        
        # Determine appropriate response mode
        rmode = "compact"
        if last_msg.lower() in ["summary", "summarize", "what is this", "tell me about this"]:
            rmode = "tree_summarize"
            
        llm = llm_service._get_llama_index_model(active_model)
        
        # Explicit PromptHelper ensures synthesis respects our safe context window
        # We also budget 2048 for output tokens to avoid squeezing the response.
        prompt_helper = PromptHelper(
            context_window=llm.context_window,
            num_output=2048,
            chunk_overlap_ratio=0.1
        )
            
        synthesizer = get_response_synthesizer(
            response_mode=rmode,
            llm=llm,
            prompt_helper=prompt_helper,
            use_async=True
        )
        
        # Construct the "Query" for synthesis
        # We include the conversation history context for the synthesizer
        history_summary = ""
        if len(final_messages) > 1:
            prev_msgs = final_messages[:-1]
            history_summary = "Conversation history:\n" + "\n".join([f"{m.role}: {m.content[:200]}..." for m in prev_msgs[-5:]])
        
        full_query = f"{history_summary}\n\nUser Question: {last_msg}"
        
        # Synthesize response using nodes
        response_content = await synthesizer.asynthesize(
            query=full_query,
            nodes=total_nodes
        )
        response_content = str(response_content)
    else:
        # Simple LLM call if no context
        response_content = await llm_service.chat(final_messages, active_model)

    try:
        return ChatResponse(role="assistant", content=response_content, citations=citations)
    except Exception as e:
        print(f"[ChatEndpoint] Validation Error: {e}. Returning response without citations.")
        return ChatResponse(role="assistant", content=response_content, citations=[])


@router.post("/chat/match-agent", response_model=AgentMatchResponse)
async def match_agent_endpoint(
    request: AgentMatchRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Match a chat message against available agents.
    
    This endpoint is used for "Agentic Mode" - it analyzes the user's
    message and returns a list of agents that can handle the request.
    
    Args:
        request: The match request containing the user's message.
        db: Database session.
        current_user: The authenticated user.
        
    Returns:
        List of matching agents with confidence scores.
    """
    try:
        matches = await agent_matcher.match_request_to_agents(
            message=request.message,
            db=db,
            user_id=current_user.id,
            top_k=request.top_k or 3,
            min_confidence=request.min_confidence or 0.5
        )
        
        # Convert to response models
        match_results = [
            AgentMatchResult(
                agent_id=m.agent_id,
                agent_name=m.agent_name,
                agent_description=m.agent_description,
                confidence=m.confidence,
                reason=m.reason,
                inputs_schema=m.inputs_schema
            )
            for m in matches
        ]
        
        return AgentMatchResponse(
            matches=match_results,
            message=request.message
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/chat/execute-agent", response_model=AgentExecuteFromChatResponse)
async def execute_agent_from_chat_endpoint(
    request: AgentExecuteFromChatRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Execute an agent from chat context.
    
    This endpoint uses the SAME code path as dry-run, but with
    steps_limit=None so it runs until completion or GUI input needed.
    
    Dry-run: execute_blueprint(steps_limit=1) -> pause after each step
    Chatbot: execute_blueprint(steps_limit=None) -> run to completion/GUI
    
    If a GUI form is required, returns status="waiting_for_input" with
    the gui_schema for the frontend to render. The frontend should then
    call /executions/{id}/input to submit the form and resume execution.
    
    Args:
        request: The execution request with agent ID and inputs.
        db: Database session.
        current_user: The authenticated user.
        
    Returns:
        Agent execution result with outputs, or GUI schema if form needed.
    """
    # Load the agent blueprint
    blueprint = db.query(AgentBlueprint).filter(
        AgentBlueprint.id == request.agent_id
    ).first()
    
    if not blueprint:
        raise HTTPException(status_code=404, detail="Agent not found")
    
    # Check access
    if blueprint.owner_id != current_user.id and not blueprint.is_published:
        raise HTTPException(status_code=403, detail="Access denied")
    
    try:
        # Add user ID to inputs for tracking
        inputs = {**request.inputs, "_user_id": current_user.id}
        
        # Execute using the SAME code path as dry-run
        # Difference: steps_limit=None means run until completion or GUI pause
        result = await execute_blueprint(
            db, 
            request.agent_id, 
            inputs, 
            steps_limit=None  # Run until completion or GUI input needed
        )
        
        # Determine success
        status = result.get("status", "failed")
        is_success = status == "completed"
        
        return AgentExecuteFromChatResponse(
            success=is_success,
            status=status,
            agent_id=request.agent_id,
            agent_name=blueprint.name,
            outputs=result.get("outputs", {}),
            error=result.get("error"),
            execution_id=result.get("execution_id"),
            # GUI fields (only present when waiting_for_input)
            gui_schema=result.get("gui_schema") if status == "waiting_for_input" else None,
            tool_name=result.get("tool_name") if status == "waiting_for_input" else None,
            description=result.get("description") if status == "waiting_for_input" else None
        )
        
    except Exception as e:
        return AgentExecuteFromChatResponse(
            success=False,
            status="failed",
            agent_id=request.agent_id,
            agent_name=blueprint.name,
            outputs={},
            error=str(e)
        )
