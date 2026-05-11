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
from app.routers.auth import get_current_active_user, PermissionChecker
from app.models.user import User
from app.services.llm_service import llm_service
from app.services.agent_matcher import agent_matcher
from app.services.agent_runtime import execute_blueprint
from app.models.agent_blueprint import AgentBlueprint


router = APIRouter()


def resolve_conversation_context(db: Session, conversation_id: str, last_user_message: str = "", active_model: str = "default") -> dict:
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
        domain_item_ids = set()
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
                domain_item_ids.add(t.id)
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
                     domain_item_ids.add(child.id) # Treat linked domain items as "domain items"
                     linked_ids.add(child.id)

        # 3. Global Fallback
        if len(linked_ids) == 0:
            debug_log.append("No specific context linked. Falling back to Global Canvas Context")
            all_things = db.query(CanvasThing).filter(
                CanvasThing.canvas_id == convo_node.canvas_id,
                CanvasThing.id != convo_node.id
            ).all()
            for t in all_things:
                domain_item_ids.add(t.id) # In global fallback, everything is a domain item
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
                elif node.type in ["slideshow", "document", "text"]:
                    rag_candidates.append({"thing_id": node.id, "asset_id": None})
                
                # Capture Text Context as TextNodes
                if node.type in ["text", "message", "agent_result", "url"]:
                    txt = node.content.get("text") or node.content.get("content") or ""
                    if txt:
                        used_citation_ids.add(node.id)
                        nodes.append(NodeWithScore(
                            node=TextNode(
                                text=f"[{node.title or 'Note'}]: {txt}", 
                                metadata={"thing_id": node.id, "type": node.type}
                            ),
                            score=1.0
                        ))
                        
                if node.content.get("generated_description"):
                    used_citation_ids.add(node.id)
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
                    results = rag_service.search(query, filters={"thing_id": tid}, k=3, model_name=active_model)
                    
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
                            "Summary Introduction Abstract", filters={"thing_id": tid}, k=2, model_name=active_model
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
                      used_citation_ids.add(node.id)
                      nodes.append(NodeWithScore(
                          node=TextNode(
                              text=f"[{node.title}]: {node.content['content']}",
                              metadata={"thing_id": node.id, "type": "document"}
                          ),
                          score=1.0
                      ))


            # C. Generate Context Manifest
            manifest_text = "CURRENT ACTIVITY INVENTORY (Authorized items in scope):\n"
            
            domain_nodes = [n for n in linked_nodes if n.id in domain_item_ids]
            external_nodes = [n for n in linked_nodes if n.id not in domain_item_ids]

            if domain_nodes:
                manifest_text += "ITEMS CURRENTLY IN DOMAIN:\n"
                for node in sorted(domain_nodes, key=lambda x: x.title or ""):
                     manifest_text += f"- {node.title} (Type: {node.type}, ID: {node.id})\n"
            
            if external_nodes:
                manifest_text += "\nEXTERNAL LINKED REFERENCES (Linked but NOT part of the current domain):\n"
                for node in sorted(external_nodes, key=lambda x: x.title or ""):
                     manifest_text += f"- {node.title} (Type: {node.type}, ID: {node.id})\n"

            if not linked_nodes:
                manifest_text += "(No items currently in scope)\n"

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
                
                raw_t = ""
                if original_node.content:
                    parts_t = []
                    for k in ["text", "content", "generated_markdown", "generated_description", "ai_description"]:
                        val = original_node.content.get(k)
                        if val and isinstance(val, str):
                            parts_t.append(val)
                    
                    slides_arr = original_node.content.get("slides")
                    if slides_arr and isinstance(slides_arr, list):
                        for s_idx, s in enumerate(slides_arr):
                            if isinstance(s, dict) and s.get("ai_description"):
                                parts_t.append(f"Slide {s_idx+1}: {s.get('ai_description')}")
                    
                    raw_t = "\n".join(parts_t)
                
                citation = {
                    "id": original_node.id, 
                    "title": original_node.title or "Untitled", 
                    "type": original_node.type,
                    "text": raw_t,
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
                        "page": m.node.metadata.get("page_label") or m.node.metadata.get("slide_number"), # PDF Page or PowerPoint Slide
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
    db: Session = Depends(get_db),
    user: User = Depends(PermissionChecker("chat:use"))
):
    """Debug endpoint to see what context is resolved for a conversation ID."""
    from app.services.rag_service import rag_service
    
    result = resolve_conversation_context(db, conversation_id, "DEBUG_TEST", "default")
    
    # Debug the fallback logic too
    if not result.get("linked_items"):
        direct_results = rag_service.search("DEBUG_TEST", conversation_id=conversation_id, k=3, response_mode="simple", model_name="default")
        result["fallback_rag_results"] = direct_results
        result["fallback_message"] = f"Found {len(direct_results)} items via direct RAG search"
        
    return result
        
    return result

@router.post("/chat", response_model=ChatResponse)
async def chat_endpoint(
    request: ChatRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker("chat:use"))
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
    kb_context, kb_citations = await context_enrichment_service.enrich_context(last_msg, request.kb_id, db, active_model)
    if kb_context:
        # Augment the last message content with the KB context
        for m in reversed(final_messages):
            if m.role == "user":
                m.content = f"{kb_context}\n\n=== PRIMARY SUBJECT (USER QUERY) ===\n{last_msg}\n======================================\n\nCRITICAL INSTRUCTION: The Knowledge Base Context above is STRICTLY for reference. Your primary task is to answer the User Query inside the PRIMARY SUBJECT block."
                last_msg = m.content
                break

    total_nodes = []
    citations = []
    
    if kb_context:
        citations.extend(kb_citations)

    if request.conversation_id:
        # Resolve Canvas Context (Nodes)
        ctx_result = resolve_conversation_context(db, request.conversation_id, last_msg, active_model)
        total_nodes.extend(ctx_result.get("nodes", []))
        citations.extend(ctx_result.get("citations", []))
        
        # FALLBACK: Check for direct RAG content
        if not ctx_result.get("linked_items"):
            direct_results = rag_service.search(last_msg, conversation_id=request.conversation_id, k=3, model_name=active_model)
            for res in direct_results:
                meta = res.get('metadata', {})
                total_nodes.append(NodeWithScore(
                    node=TextNode(text=res['text'], metadata=meta),
                    score=res.get('score', 1.0)
                ))
                # Add to citations for re-indexing
                asset_id = meta.get("asset_id") or meta.get("file_id") or f"rag-{uuid.uuid4().hex[:4]}"
                title = meta.get("title") or meta.get("file_name") or meta.get("source_uri") or "Source"
                citations.append({
                    "id": str(asset_id),
                    "title": title,
                    "type": meta.get("type", "Document"),
                    "matches": [{
                        "text": res['text'],
                        "score": res.get('score', 1.0),
                        "page": meta.get("page_label") or meta.get("slide_number")
                    }]
                })
    else:
        # Sidebar Generic Fallback
        results = rag_service.search(last_msg, filters={"owner_id": current_user.id, "source": "sidebar_upload"}, k=3, model_name=active_model)
        for res in results:
            meta = res.get('metadata', {})
            total_nodes.append(NodeWithScore(
                node=TextNode(text=res['text'], metadata=meta),
                score=res.get('score', 1.0)
            ))
            asset_id = meta.get("asset_id") or meta.get("file_id") or f"side-{uuid.uuid4().hex[:4]}"
            title = meta.get("title") or meta.get("file_name") or "Sidebar Upload"
            citations.append({
                "id": str(asset_id),
                "title": title,
                "type": "Document",
                "matches": [{
                    "text": res['text'],
                    "score": res.get('score', 1.0),
                    "page": meta.get("page_label") or meta.get("slide_number")
                }]
            })


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
        # We include the conversation history context and the active manifest
        history_summary = ""
        if len(final_messages) > 1:
            prev_msgs = final_messages[:-1]
            history_summary = "CONVERSATION HISTORY (May contain references to items no longer in scope):\n" + "\n".join([f"{m.role}: {m.content[:200]}..." for m in prev_msgs[-5:]])
        
        manifest_text = ctx_result.get("manifest_text") if request.conversation_id else ""
        
        full_query = (
            f"{history_summary}\n\n"
            f"{manifest_text}\n\n"
            f"USER QUESTION: {last_msg}\n\n"
            f"CRITICAL CONTEXT INSTRUCTION: Over the course of a conversation, items may be added or removed from the domain. "
            f"The 'CURRENT ACTIVITY INVENTORY' above represents the authoritative list of items currently in the conversation's scope. "
            f"If the user asks about 'how many' items there are, or refers to 'these items', ONLY consider those in the CURRENT ACTIVITY INVENTORY. "
            f"Items mentioned in the CONVERSATION HISTORY but MISSING from the CURRENT ACTIVITY INVENTORY should be treated as having been removed from the context. "
            f"\n\nIMPORTANT: You MUST cite the sources used in your answer. "
            f"Use inline citations in the format 【Source Name】 (e.g., 【Slide 7】 or 【E-Government Strategy】) as shown in the context blocks. "
            f"Place these markers immediately after the sentences or facts they support."
        )
        
        # Synthesize response using nodes
        response_content = await synthesizer.asynthesize(
            query=full_query,
            nodes=total_nodes
        )
        response_content = str(response_content)

        # --- SEQUENTIAL RE-INDEXING (Post-processing) ---
        import re
        
        def normalize_title(t: str) -> str:
            if not t: return ""
            # Handle special characters (non-breaking hyphen, specialized spaces)
            t = t.replace('‑', '-').replace('–', '-')
            # Remove all non-alphanumeric (except hyphen) while preserving spaces, then collapse whitespace
            t = re.sub(r'[^\w\s-]', '', t.lower())
            return " ".join(t.split())

        # 1. Strip any existing "References" or "Sources" section to start fresh
        body_content = response_content
        header_patterns = [
            r'\n+### References.*$', r'\n+References:.*$', r'\n+References\n*.*$',
            r'\n+【References】.*$', r'\n+## References.*$',
            r'\n+### Sources.*$', r'\n+Sources:.*$', r'\n+Sources\n*.*$',
            r'\n+【Sources】.*$', r'\n+## Sources.*$',
            r'\n+Source:.*$', r'\n+Source\n*.*$'
        ]
        for pattern in header_patterns:
            body_content = re.sub(pattern, '', body_content, flags=re.DOTALL | re.IGNORECASE)

        # 2. Extract markers ONLY from the body
        found_markers = []
        for match in re.finditer(r'【([^】]+)】|\[([^\]]+)\]', body_content):
            val = match.group(1) or match.group(2)
            if val:
                val_stripped = val.strip()
                # Ignore markers that are just pure digits, because this means the LLM
                # tried to do the sequential numbering itself instead of using the source names.
                if val_stripped.isdigit():
                    print(f"[RE-INDEX] Ignoring LLM-generated numeric marker: {match.group(0)}")
                    # Remove it from the text entirely so it doesn't clutter
                    body_content = body_content.replace(match.group(0), "")
                    continue
                    
                found_markers.append({
                    "raw": match.group(0),
                    "val": val.strip(),
                    "norm": normalize_title(val),
                    "pos": match.start()
                })

        re_index_map = {} # raw -> new_idx
        new_citations = []
        next_idx = 1
        
        # Build comprehensive mapping (Markers -> Citation)
        marker_to_cit = {normalize_title(c["title"]): c for c in citations if c.get("title")}
        
        for c in citations:
            for m in c.get("matches", []):
                p = m.get("page")
                if p:
                    marker_to_cit[normalize_title(f"slide {p}")] = c
                    marker_to_cit[normalize_title(f"page {p}")] = c
                    if str(p).isdigit():
                        marker_to_cit[normalize_title(p)] = c

        unique_sources_used = {} # (cit_id, specific_ref) -> new_idx
        
        print(f"[RE-INDEX] Found markers in text: {[m['val'] for m in found_markers]}")
        print(f"[RE-INDEX] Reference titles available: {[c['title'] for c in citations]}")

        for marker in found_markers:
            norm_val = marker["norm"]
            raw = marker["raw"]
            
            target_cit = None
            if norm_val in marker_to_cit:
                target_cit = marker_to_cit[norm_val]
            else:
                for k, c in marker_to_cit.items():
                    # Check title
                    if norm_val and k and (norm_val in k or k in norm_val):
                        target_cit = c
                        break
                    # Check ontology name fallback (for KB snippets)
                    ont_name = normalize_title(c.get("ontology_name", ""))
                    if ont_name and norm_val and (norm_val in ont_name or ont_name in norm_val):
                        target_cit = c
                        break
                
                # Cleanup hallucinated LLM suffixes if standard match failed
                if not target_cit:
                    import re
                    clean_norm = re.sub(r'\b(?:snippet|source|doc|document|file)\b', '', norm_val).strip()
                    if clean_norm and len(clean_norm) >= 4:
                        for k, c in marker_to_cit.items():
                            if clean_norm in k or k in clean_norm:
                                target_cit = c
                                break
                            ont_name = normalize_title(c.get("ontology_name", ""))
                            if ont_name and (clean_norm in ont_name or ont_name in clean_norm):
                                target_cit = c
                                break

                # Deep text scan for phantom slide/page markers
                if not target_cit:
                    p_match = re.search(r'(?:slide|page|row)\s*(\d+)', norm_val, re.IGNORECASE)
                    if p_match:
                        target_num = p_match.group(1)
                        # Check which citation text contains this number
                        for c in citations:
                            # 1. Search full document text if available (for newly injected canvas items)
                            full_text = c.get("text", "")
                            pattern = r'(?:slide|page)(?:s)?\s*:?\s*' + str(target_num) + r'\b'
                            if full_text and re.search(pattern, full_text, re.IGNORECASE):
                                target_cit = c
                                break
                                
                            # 2. Search RAG specific matches
                            for m in c.get("matches", []):
                                text = m.get("text", "")
                                if re.search(pattern, text, re.IGNORECASE):
                                    target_cit = c
                                    break
                            if target_cit:
                                break
            
            if target_cit:
                specific_ref = None
                p_match = re.search(r'(?:slide|page|row)\s*(\d+)', norm_val, re.IGNORECASE)
                if p_match:
                    specific_ref = f"Slide/Page {p_match.group(1)}"
                
                key = (target_cit["id"], specific_ref)
                if key not in unique_sources_used:
                    unique_sources_used[key] = next_idx
                    new_cit = target_cit.copy()
                    new_cit["ref_index"] = next_idx
                    if specific_ref:
                         new_cit["title"] = f"{target_cit['title']} ({specific_ref})"
                    new_citations.append(new_cit)
                    next_idx += 1
                
                re_index_map[raw] = unique_sources_used[key]
                print(f"[RE-INDEX] MATCHED: '{raw}' -> '{target_cit['title']}' (Specific: {specific_ref})")
            else:
                print(f"[RE-INDEX] FAILED TO MATCH: '{raw}' (norm: '{norm_val}'). Available: {list(marker_to_cit.keys())}")

        # 3. Perform replacements on the body
        if re_index_map:
            sorted_markers = sorted(found_markers, key=lambda x: x["pos"], reverse=True)
            text_chars = list(body_content)
            for marker in sorted_markers:
                raw = marker["raw"]
                if raw in re_index_map:
                    new_marker = f"【{re_index_map[raw]}】"
                    start = marker["pos"]
                    end = start + len(raw)
                    text_chars[start:end] = list(new_marker)
            
            final_response = "".join(text_chars)
            
            # 4. Append Absolute Footer
            ref_footer = "\n\n### References\n"
            for c in sorted(new_citations, key=lambda x: x["ref_index"]):
                ref_footer += f"【{c['ref_index']}】 {c['title']}\n"
            
            response_content = final_response + ref_footer
            citations = new_citations
        else:
            response_content = body_content
            if not found_markers:
                citations = []
        # -----------------------------------------------------

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
    current_user: User = Depends(PermissionChecker("chat:use"))
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
    current_user: User = Depends(PermissionChecker("chat:use"))
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
