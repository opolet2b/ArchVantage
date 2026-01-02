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


@router.post("/chat", response_model=ChatResponse)
async def chat_endpoint(
    request: ChatRequest,
    db: Session = Depends(get_db)
):
    """
    Standard chat endpoint with RAG context support.
    
    If conversation_id is provided, it resolves linked Canvas context:
    1. Finds the Conversation Node on the canvas.
    2. Finds all connected nodes (docs, images, text, etc.).
    3. Retrieves relevant content from RAG (for docs) or raw content (for text).
    4. Injects context into the system prompt.
    """
    from app.models.canvas_models import CanvasThing, CanvasLink
    from sqlalchemy import or_
    from app.services.rag_service import rag_service

    final_messages = list(request.messages)
    
    if request.conversation_id:
        print(f"[Chat] Resolving context for conversation: {request.conversation_id}")
        
        # 1. Find Conversation Node
        # JSON filtering is dialect-specific, so we fetch candidates and filter in Python for portability
        # Optimization: Filter by type first
        candidates = db.query(CanvasThing).filter(CanvasThing.type == "conversation").all()
        convo_node = next((t for t in candidates if t.content.get("conversation_id") == request.conversation_id), None)
        
        if convo_node:
            print(f"[Chat] Found conversation node: {convo_node.id} ({convo_node.title})")
            
            # 2. Find Linked Nodes
            # Fetch links where this node is source OR target
            links = db.query(CanvasLink).filter(
                or_(
                    CanvasLink.source_id == convo_node.id,
                    CanvasLink.target_id == convo_node.id
                )
            ).all()
            
            linked_ids = set()
            for link in links:
                target_id = link.target_id if link.source_id == convo_node.id else link.source_id
                linked_ids.add(target_id)
            
            # 2a. Domain Context (Recursive)
            if convo_node.domain_id:
                print(f"[Chat] Conversation is in domain: {convo_node.domain_id}. resolving siblings...")
                from app.models.canvas_models import Domain
                
                # Helper to collect all descendant domain IDs
                def get_descendant_domain_ids(root_id):
                    descendants = set([root_id])
                    # Note: This is a simple iterative fetch. For deep trees, CTE is better, but this is fine for canvas.
                    children = db.query(Domain).filter(Domain.parent_id == root_id).all()
                    for child in children:
                        descendants.update(get_descendant_domain_ids(child.id))
                    return descendants
                
                domain_ids = get_descendant_domain_ids(convo_node.domain_id)
                print(f"[Chat] Found domain hierarchy: {domain_ids}")
                
                # Fetch all things in these domains (excluding self)
                domain_things = db.query(CanvasThing).filter(
                    CanvasThing.domain_id.in_(domain_ids),
                    CanvasThing.id != convo_node.id
                ).all()
                
                for t in domain_things:
                    linked_ids.add(t.id)

            # 3. Global Fallback (Entire Canvas)
            # If NO links and NO domain context, assume the user wants to chat about the entire canvas.
            if not linked_ids:
                print(f"[Chat] No specific context linked. Falling back to Global Canvas Context (Canvas ID: {convo_node.canvas_id})")
                all_things = db.query(CanvasThing).filter(
                    CanvasThing.canvas_id == convo_node.canvas_id,
                    CanvasThing.id != convo_node.id
                ).all()
                for t in all_things:
                    linked_ids.add(t.id)

            if linked_ids:
                linked_nodes = db.query(CanvasThing).filter(CanvasThing.id.in_(linked_ids)).all()
                print(f"[Chat] Found {len(linked_nodes)} linked context nodes.")
                
                asset_ids = []
                text_context = []
                
                for node in linked_nodes:
                    # Collect Asset IDs for RAG
                    if node.content.get("asset_id"):
                        asset_ids.append(node.content["asset_id"])
                    
                    # Collect Text Content directly
                    # Handle "text", "message", or result types
                    if node.type in ["text", "message", "agent_result", "url"]:
                        txt = node.content.get("text") or node.content.get("content") or ""
                        if txt:
                            text_context.append(f"[{node.title or 'Note'}]: {txt}")
                            
                    # Handle Scanned/Described Images that are effectively text now
                    if node.content.get("generated_description"):
                        text_context.append(f"[Image Description: {node.title}]: {node.content['generated_description']}")

                context_parts = []
                
                # A. Retrieve from RAG for Assets
                if asset_ids:
                    # Extract last user message for query
                    last_msg = next((m.content for m in reversed(request.messages) if m.role == "user"), "")
                    if last_msg:
                        print(f"[Chat] Querying RAG for assets: {asset_ids}")
                        # Filter by metadata asset_id (Exact Match OR In)
                        # Since we might have multiple, we ideally use "In" filter or separate queries
                        # Chroma/LlamaIndex support depends on version.
                        # Simple approach: Search broadly or iterate?
                        # Better: Allow rag_service to handle list filter if supported, 
                        # OR simply loop query if few assets (safe)
                        
                        # Note: rag_service.search uses ExactMatchFilter by default for specific keys
                        # We will try to pass a list if possible? No, ExactMatch is scalar usually.
                        # Let's try to fetch relevant context for EACH asset if small number?
                        # Or just search GLOBAL index with asset_id filter?
                        # Currently we don't have an "IN" filter exposed in RAGService.search clearly.
                        
                        # Workaround: Retrieve from index without filter? No, context leakage.
                        # Let's just fetch ALL content for the linked assets if they are small docs? 
                        # RAG is for large docs.
                        
                        # Let's assume standard "vector search" across specific assets.
                        # Since we can't pass "IN", let's use a "filter_list" in `rag_service.search` if we modify it,
                        # OR just query with NO filter but check metadata in results? Inefficient.
                        
                        # Best approach for now:
                        # Iterate assets and query (limit top_k=2 per asset)
                        for aid in asset_ids:
                            results = rag_service.search(
                                last_msg, 
                                filters={"asset_id": aid}, 
                                k=3
                            )
                            for res in results:
                                context_parts.append(f"[Document Context]: {res['text']}")

                # B. Add Raw Text Context
                context_parts.extend(text_context)
                
                if context_parts:
                     system_prompt = (
                        "You are a helpful assistant with access to a Semantic Canvas.\n"
                        "Answer the user's question based on the following context linked to this conversation:\n\n"
                        + "\n---\n".join(context_parts)
                        + "\n\nIf the information is not in the context, say so, but you can use general knowledge if appropriate."
                    )
                     
                     # Insert System Prompt at beginning
                     # Check if system prompt exists
                     if final_messages[0].role == "system":
                         final_messages[0].content += f"\n\n{system_prompt}"
                     else:
                         final_messages.insert(0, type(final_messages[0])(role="system", content=system_prompt))

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
