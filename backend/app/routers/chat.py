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
      - system_prompt_addendum: The text to add to system prompt
      - linked_items: List of items found
      - debug_log: List of strings describing what happened
    """
    from app.models.canvas_models import CanvasThing, CanvasLink, Domain
    from sqlalchemy import or_
    from app.services.rag_service import rag_service
    
    debug_log = []
    debug_log.append(f"Resolving context for {conversation_id}")
    
    # 1. Find Conversation Node
    candidates = db.query(CanvasThing).filter(CanvasThing.type == "conversation").all()
    convo_node = next((t for t in candidates if str(t.content.get("conversation_id")) == conversation_id), None)
    
    linked_ids = set()
    linked_items_summary = []
    
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

        # Process Linked IDs
        context_parts = []
        if linked_ids:
            linked_nodes = db.query(CanvasThing).filter(CanvasThing.id.in_(list(linked_ids))).all()
            debug_log.append(f"Found {len(linked_nodes)} linked context nodes.")
            
            rag_candidates = []
            text_context = []
            
            for node in linked_nodes:
                linked_items_summary.append({"id": node.id, "title": node.title, "type": node.type})
                
                if node.content.get("asset_id"):
                    rag_candidates.append({"thing_id": node.id, "asset_id": node.content["asset_id"]})
                
                if node.type in ["text", "message", "agent_result", "url"]:
                    txt = node.content.get("text") or node.content.get("content") or ""
                    if txt:
                        text_context.append(f"[{node.title or 'Note'}]: {txt}")
                        
                if node.content.get("generated_description"):
                    text_context.append(f"[Image Description: {node.title}]: {node.content['generated_description']}")

            # A. Retrieve from RAG for Assets
            if rag_candidates:
                # Determine query string
                query = last_user_message if last_user_message else "Summary"
                debug_log.append(f"Querying RAG for {len(rag_candidates)} candidates with query: '{query}'")
                
                for cand in rag_candidates:
                    tid = cand["thing_id"]
                    aid = cand["asset_id"]
                    
                    # We filter by THING_ID because that is what is in the DB metadata
                    # (Asset ID was missing in metadata due to bug)
                    results = rag_service.search(
                        query, 
                        filters={"thing_id": tid}, 
                        k=3
                    )
                    
                    if results:
                        for res in results:
                            context_parts.append(f"[Document Context]: {res['text']}")
                    else:
                        # Fallback: If specific query yielded no results, try to fetch a summary/intro
                        debug_log.append(f"No results for thing {tid} (asset {aid}). Attempting fallback...")
                        fallback_results = rag_service.search(
                            "Summary Introduction Abstract", 
                            filters={"thing_id": tid}, 
                            k=2
                        )
                        if fallback_results:
                            debug_log.append(f"Fallback successful for {tid}")
                            for res in fallback_results:
                                context_parts.append(f"[Document Context (Summary/Preview)]: {res['text']}")
                        else:
                             debug_log.append(f"Fallback also empty for {tid}")

            # B. Add Raw Text Context
            for node in linked_nodes:
                 if node.type == "document" and node.content.get("content"):
                      content_len = len(node.content.get("content", ""))
                      if content_len < 10000:
                           text_context.append(f"[{node.title}]: {node.content['content']}")

            context_parts.extend(text_context)
            
            # C. Generate Context Manifest
            manifest_text = "You have access to the following context items:\n"
            for node in linked_nodes:
                 manifest_text += f"- {node.title} ({node.type})\n"

            # D. Inject Graph Relationships
            # Query links where both source and target are in our context set
            if linked_ids:
                relevant_links = db.query(CanvasLink).filter(
                    CanvasLink.source_id.in_(list(linked_ids)),
                    CanvasLink.target_id.in_(list(linked_ids))
                ).all()
                
                if relevant_links:
                    manifest_text += "\nKNOWN RELATIONSHIPS:\n"
                    # Map IDs to Titles for readability
                    id_to_title = {n.id: n.title or "Untitled" for n in linked_nodes}
                    
                    # Also fetch Domains if they are in the linked set
                    linked_domains = db.query(Domain).filter(Domain.id.in_(list(linked_ids))).all()
                    for d in linked_domains:
                        id_to_title[d.id] = d.name
                    
                    for link in relevant_links:
                        src = id_to_title.get(link.source_id, "Unknown")
                        tgt = id_to_title.get(link.target_id, "Unknown")
                        res = link.type.value
                        
                        # Include label if present
                        if link.label:
                            res += f": \"{link.label}\""
                            
                        manifest_text += f"- \"{src}\" --[{res}]--> \"{tgt}\"\n"
                    
                    debug_log.append(f"Injected {len(relevant_links)} graph relationships into context.")

            # Construct full context block
            context_data_text = manifest_text + "\n"
            if context_parts:
                context_data_text += "Answer the user's question based on the following linked context:\n\n"
                context_data_text += "\n---\n".join(context_parts)
                context_data_text += "\n\nIf the information is not in the context, say so, but you can use general knowledge if appropriate."
            else:
                context_data_text += "No specific text content was retrieved for these items (they may be large files, images, or empty).\n"
                context_data_text += "Answer the user's question to the best of your ability."

            # Legacy full system prompt for backward compatibility or direct system injection
            system_prompt = (
                "You are a helpful assistant with access to a Semantic Canvas.\n" +
                context_data_text
            )
            
            return {
                "system_prompt_addendum": system_prompt, # Keeping for debug
                "context_data_text": context_data_text,  # New structured return
                "manifest_text": manifest_text,
                "linked_items": linked_items_summary,
                "debug_log": debug_log
            }
            
    return {
        "system_prompt_addendum": None, 
        "context_data_text": None,
        "manifest_text": None,
        "linked_items": [], 
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
        direct_results = rag_service.search("DEBUG_TEST", conversation_id=conversation_id, k=3)
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
    Standard chat endpoint with RAG context support.
    
    If conversation_id is provided, it resolves linked Canvas context.
    If NOT provided (Generic Sidebar Chat), it searches "Sidebar Uploads" for the user.
    """
    from app.services.rag_service import rag_service
    
    final_messages = list(request.messages)
    
    # Extract last user message for query
    last_msg = ""
    for m in reversed(request.messages):
        if m.role == "user":
            last_msg = m.content
            break

    if request.conversation_id:
        # Resolve Canvas Context
        ctx_result = resolve_conversation_context(db, request.conversation_id, last_msg)
        
        # Inject Context into System Prompt
        if ctx_result["system_prompt_addendum"]:
            # We inject this as a hidden system message or append to the last user message
            # For robustness, we'll append to the last user message so the model definitely sees it
            
            # Find last user message in final_messages to append context
            for i in range(len(final_messages) - 1, -1, -1):
                if final_messages[i].role == "user":
                    # Append context cleanly
                    final_messages[i].content += f"\n\n--- RELEVANT CONTEXT ---\n{ctx_result['context_data_text']}\n------------------------"
                    break
        
        # FALLBACK: If no Canvas items were found, this might be a pure Sidebar Chat
        # Check if there are documents directly associated with this conversation_id (via rag.py upload)
        if not ctx_result.get("linked_items"):
            print(f"[Chat] No Canvas links found. Checking for direct RAG content for conversation {request.conversation_id}")
            direct_results = rag_service.search(last_msg, conversation_id=request.conversation_id, k=3)
            
            if direct_results:
                 print(f"[Chat] Found {len(direct_results)} direct RAG items for conversation.")
                 direct_context = "\n".join([f"[Document Context]: {res['text']}" for res in direct_results])
                 
                 # Inject into last user message
                 for i in range(len(final_messages) - 1, -1, -1):
                    if final_messages[i].role == "user":
                        # If we already added context (unlikely if linked_items was empty, but safe to check), append
                        if "--- RELEVANT CONTEXT ---" in str(final_messages[i].content):
                             final_messages[i].content += f"\n\n--- ADDITIONAL CONTEXT ---\n{direct_context}\n--------------------------"
                        else:
                             final_messages[i].content += f"\n\n--- UPLOADED FILE CONTEXT ---\n{direct_context}\n-----------------------------"
                        break
    
    else:
        # GENERIC SIDEBAR CHAT FALLBACK
        # Search all assets uploaded by this user via the sidebar
        print(f"[Chat] Generic chat request from user {current_user.id}. Query: {last_msg}")
        
        results = rag_service.search(
            last_msg,
            filters={
                "owner_id": current_user.id,
                "source": "sidebar_upload"
            },
            k=3
        )
        
        if results:
            print(f"[Chat] Found {len(results)} generic context items for user.")
            context_text = "\n".join([f"[Document Context]: {res['text']}" for res in results])
            
            # Inject into last user message
            for i in range(len(final_messages) - 1, -1, -1):
                if final_messages[i].role == "user":
                    final_messages[i].content += f"\n\n--- UPLOADED FILE CONTEXT ---\n{context_text}\n-----------------------------"
                    break
        else:
            print("[Chat] No generic context found.")


    response_content = await llm_service.chat(final_messages, request.model)
    return ChatResponse(role="assistant", content=response_content)


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
