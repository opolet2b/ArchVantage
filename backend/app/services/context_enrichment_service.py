"""
Context Enrichment Service

Centralized service to augment user queries with Knowledge Base context.
Identifies relevant nodes in a KB and fetches related external content.
"""
import os
from sqlalchemy.orm import Session
from typing import Optional, List, Dict
from app.core.arcadedb import arcadedb
from app.models.knowledge_graph import KnowledgeBaseConfig
from app.services.llm_service import llm_service
from app.utils.document_parser import document_parser
from app.services.web_crawler_service import web_crawler_service

class ContextEnrichmentService:
    async def enrich_context(self, query: str, kb_id: Optional[str], db: Session, active_model: str = "default") -> tuple[str, list]:
        print(f"[ContextEnrichment] Received enrich request for kb_id: {kb_id}")
        if not kb_id or kb_id == "none" or kb_id == "--NONE--":
            print(f"[ContextEnrichment] Skipping KB search, invalid kb_id: {kb_id}")
            return "", []
            
        # 1. Check if KB exists
        db_kb = db.query(KnowledgeBaseConfig).filter(KnowledgeBaseConfig.id == kb_id).first()
        if not db_kb:
            print(f"[ContextEnrichment] KB not found in DB: {kb_id}")
            return "", []
            
        kb_active = (db_kb.status == "active")
        if not kb_active:
            print(f"[ContextEnrichment] KB '{kb_id}' is in status '{db_kb.status}'. Skipping local vector search, but will proceed with API checks.")
            
        # 2. Extract semantic keywords/entities from the query to search ArcadeDB
        # A simple LLM call to extract keywords OR just use the query directly for a rough match.
        system_prompt = "Extract 3-5 key search terms or entity names from the following query. Return ONLY a comma-separated list of terms."
        try:
            keywords_str = await llm_service.chat_completion(
                system_prompt=system_prompt,
                user_prompt=query,
                model=db_kb.llm_config_id or active_model
            )
            keywords = [k.strip() for k in keywords_str.split(',')]
        except Exception as e:
            print(f"[ContextEnrichment] Failed to extract keywords: {e}")
            keywords = [query]
            
        enriched_blocks = []
        sources_fetched = set()
        citations = []
        
        if kb_active:
            print(f"[ContextEnrichment] Searching KB {kb_id} for keywords: {keywords}")
            
            # 3. Semantic Search in ChromaDB to find relevant Ontology Classes
            from app.services.rag_service import rag_service
            
            # We search ChromaDB exclusively for embedded ontology classes for this KB
            # This naturally handles cross-lingual queries and conceptual mapping
            try:
                 semantic_results = rag_service.search(
                     query, 
                     filters={"kb_id": kb_id, "type": "ontology_class"}, 
                     k=5,
                     model_name=db_kb.llm_config_id or active_model
                 )
                 matched_classes = []
                 for res in semantic_results:
                     meta = res.get("metadata", {})
                     cls_name = meta.get("class_name")
                     if cls_name and cls_name not in matched_classes:
                         matched_classes.append(cls_name)
                         
            except Exception as e:
                 print(f"[ContextEnrichment] Semantic search failed: {e}. Falling back to keyword search.")
                 matched_classes = []
                 
            # Fallback to direct approved classes if semantic search returned nothing
            if not matched_classes:
                approved_classes = [c.get('name') for c in (db_kb.ontology_classes or []) if c.get('approved') != False]
                # Since semantic failed, we just try to find ANY nodes matching the keywords in the approved classes
                import re
                matched_classes = [re.sub(r'[^a-zA-Z0-9_]', '_', name.replace(" ", "_")) for name in approved_classes]
                
            print(f"[ContextEnrichment] Identified relevant classes: {matched_classes}")
            
            import re
            
            # 4. Search ArcadeDB for nodes instantiated under these semantic classes
            matched_nodes = []
            for cls_name in matched_classes + ["Entity"]:
                # Sanitize the class name before asking ArcadeDB because ChromaDB metadata holds the raw display name
                sanitized_cls = re.sub(r'[^a-zA-Z0-9_]', '_', cls_name.replace(" ", "_"))
                if not sanitized_cls:
                    continue
                    
                try:
                    if not arcadedb.type_exists(sanitized_cls):
                        continue
                        
                    # First try to find nodes in this class that explicitly match keywords
                    for kw in keywords:
                         if len(kw) < 3: continue
                         db_query = f"SELECT FROM `{sanitized_cls}` WHERE graph_id = :gid AND (name.toLowerCase() LIKE :kw OR summary.toLowerCase() LIKE :kw) LIMIT 5"
                         res = arcadedb.query(db_query, params={
                             "gid": kb_id,
                             "kw": f"%{kw.lower()}%"
                         }).get("result", [])
                         matched_nodes.extend(res)
                    
                    # If still no keyword matches, just grab the top instances of this class
                    # since the semantic query already determined this class is highly relevant!
                    if not matched_nodes:
                         db_query_fallback = f"SELECT FROM `{sanitized_cls}` WHERE graph_id = :gid LIMIT 3"
                         res_fb = arcadedb.query(db_query_fallback, params={"gid": kb_id}).get("result", [])
                         matched_nodes.extend(res_fb)
                except Exception as e:
                    pass
            
            # Deduplicate nodes based on RID
            unique_nodes = {n.get("@rid"): n for n in matched_nodes if n.get("@rid")}.values()
                
            print(f"[ContextEnrichment] Found {len(unique_nodes)} matching KB nodes.")
            
            # 4. Fetch related external content
            for node in list(unique_nodes)[:10]:  # Limit to top 10
                name = node.get("name", "Unknown")
                ntype = node.get("@type", "Entity")
                summary = node.get("summary", "")
                source_uri = node.get("source_uri")
                
                # Extract metadata for citation matching
                # Priority: Metadata property > Scan summary for "Slide X" or "Page X"
                node_page = node.get("page_label") or node.get("slide_number") or node.get("page")
                if not node_page and summary:
                    # Regex to find "Slide X" or "Page X" or "Slide: X" etc.
                    p_match = re.search(r'(?:slide|page)\s*:?\s*(\d+)', summary, re.IGNORECASE)
                    if p_match:
                        node_page = p_match.group(1)
                
                node_row = node.get("row_id")
                
                node_context = f"### KB Entity: {name} ({ntype})\n"
                if node_page:
                    node_context += f"**Reference:** Slide/Page {node_page}\n"
                node_context += f"**Citation Marker:** 【{name}】\n**Summary:** {summary}\n"
                
                node_id = node.get("@rid")
                if node_id and node_id.startswith("#"):
                    node_id = node_id[1:]
                    
                citation = {
                    "id": str(node_id),
                    "title": name,
                    "type": ntype,
                    "matches": []
                }
                
                # Fetch external content if valid
                if source_uri and source_uri not in sources_fetched:
                    sources_fetched.add(source_uri)
                    try:
                        ext_content = ""
                        source_title = "Source Document"
                        if source_uri.startswith("http"):
                            ext_content = web_crawler_service.crawl_url(source_uri, max_depth=0)
                            source_title = source_uri.split("/")[-1] or source_uri
                        elif os.path.exists(source_uri):
                            ext_content = document_parser.extract_text_from_file(source_uri, char_limit=4000)
                            source_title = os.path.splitext(os.path.basename(source_uri))[0]
                            
                        if ext_content:
                            snippet = self._find_best_snippet(ext_content, keywords)
                            if snippet:
                                 # Check snippet for page as well
                                 match_page = node_page
                                 if not match_page:
                                     s_match = re.search(r'(?:slide|page|row)\s*:?\s*(\d+)', snippet, re.IGNORECASE)
                                     if s_match:
                                         match_page = s_match.group(1)
                                         
                                 node_context += f"**Source Snippet ([Source: {source_uri}]):**\n{snippet}...\n"
                                 
                                 # If we have a snippet, the citation should point to the DOCUMENT, not the ontology node
                                 citation["title"] = source_title
                                 citation["type"] = "Document"
                                 citation["ontology_name"] = name
                                 
                                 citation["matches"].append({
                                     "text": snippet, 
                                     "score": 1.0, 
                                     "page": str(match_page) if match_page else None, 
                                     "bbox": None, 
                                     "row_id": str(node_row) if node_row else None
                                 })
                    except Exception as e:
                        print(f"[ContextEnrichment] Failed to fetch source {source_uri}: {e}")
                        
                # Fallback match if no external content found (ensure page is still linked)
                if not citation["matches"]:
                     # Update title from source_uri if possible even on fallback
                     if source_uri:
                         try:
                             if source_uri.startswith("http"):
                                 fallback_title = source_uri.split("/")[-1] or source_uri
                             else:
                                 fallback_title = os.path.splitext(os.path.basename(source_uri))[0]
                             if fallback_title:
                                 citation["title"] = fallback_title
                                 citation["ontology_name"] = name
                                 citation["type"] = "Document"
                         except: pass
                         
                     citation["matches"].append({
                         "text": summary[:200], # Use start of summary as snippet
                         "score": 0.5,
                         "page": str(node_page) if node_page else None,
                         "row_id": str(node_row) if node_row else None
                     })
    
                enriched_blocks.append(node_context)
                citations.append(citation)

        # 5. Agentic Retrieval for MCP API Sources
        from app.models.tools import MCPServer
        from app.services.tool_runtime import execute_mcp_function
        import json
        
        print(f"[ContextEnrichment] Total sources attached to KB: {len(db_kb.sources or [])}")
        print(f"[ContextEnrichment] Selected Source IDs explicitly enabled: {db_kb.selected_source_ids}")
        for source in (db_kb.sources or []):
            s_id = source.get("id")
            s_type = source.get("type")
            is_selected = s_id in (db_kb.selected_source_ids or [])
            print(f"[ContextEnrichment] Evaluating Source {s_id} | Type: {s_type} | IngestionSelected: {is_selected}")
            
            # Web/Local documents must be explicitly selected for ingestion to be part of the KB context,
            # but MCP APIs are live endpoints that don't need indexing, so they are always active if attached.
            if s_type == "mcp":
                config = source.get("config", {})
                server_id = config.get("server_id")
                tool_name = config.get("tool_name")
                tool_schema = config.get("tool_schema", {})
                
                if not server_id or not tool_name: 
                    print(f"[ContextEnrichment] Skipping MCP {s_id} - missing server_id or tool_name")
                    continue
                
                server = db.query(MCPServer).filter(MCPServer.id == int(server_id)).first()
                if not server: continue
                
                print(f"[ContextEnrichment] Executing MCP Tool: {tool_name} from {server.name}")
                try:
                    # Use LLM to extract parameters for the tool based on its schema
                    sys_prompt = f"You are an API Parameter Extraction assistant. The user wants to query an API named '{tool_name}'. Based on the user query, provide a JSON object with the parameters required by this JSON schema: {json.dumps(tool_schema)}\nRespond ONLY with valid JSON."
                    
                    param_str = await llm_service.chat_completion(
                        system_prompt=sys_prompt,
                        user_prompt=query,
                        model=db_kb.llm_config_id or active_model
                    )
                    
                    try:
                         clean_param = param_str.strip()
                         if clean_param.startswith("```json"): clean_param = clean_param[7:-3]
                         elif clean_param.startswith("```"): clean_param = clean_param[3:-3]
                         params = json.loads(clean_param.strip())
                    except:
                         params = {} 
                         
                    # Execute MCP function
                    mcp_response = await execute_mcp_function(server, tool_name, params)
                    mcp_result = mcp_response.get("result", {})
                    
                    # Format result
                    mcp_text = ""
                    if isinstance(mcp_result, dict) and "content" in mcp_result:
                         texts = [c.get("text", "") for c in mcp_result["content"] if c.get("type") == "text"]
                         mcp_text = "\n".join(texts)
                    else:
                         mcp_text = str(mcp_result)
                         
                    if mcp_text:
                         mcp_context = f"### MCP API Data: {source.get('name', tool_name)}\n"
                         mcp_context += f"**Tool:** {tool_name}\n**Parameters:** {json.dumps(params)}\n"
                         mcp_context += f"**Response:**\n{mcp_text[:4000]}\n"
                         enriched_blocks.append(mcp_context)
                         
                         citations.append({
                             "id": str(source.get("id")),
                             "title": source.get("name") or tool_name,
                             "type": "API Response",
                             "matches": [{"text": mcp_text[:200], "score": 1.0, "page": None, "row_id": None}]
                         })
                except Exception as e:
                    print(f"[ContextEnrichment] MCP Execution Failed: {e}")

        if not enriched_blocks:
            return "", []
            
        final_context = "\n\n--- KNOWLEDGE BASE CONTEXT ---\n" + "\n\n".join(enriched_blocks) + "\n--------------------------------\n"
        
        # DEBUG: Dump context to see exactly what LLM is seeing
        try:
            with open(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "..", "tmp_context_dump.txt"), "w", encoding="utf-8") as f:
                f.write(final_context)
                f.write("\n\n--- CITATIONS ---\n")
                import json
                f.write(json.dumps(citations, indent=2))
        except Exception as e:
            print(f"Debug dump failed: {e}")
            
        return final_context, citations
        
    def _find_best_snippet(self, text: str, keywords: List[str], window: int = 1500) -> str:
        """Finds the most relevant snippet of text containing the keywords."""
        text_lower = text.lower()
        best_idx = 0
        
        for kw in keywords:
            if len(kw) < 3: continue
            idx = text_lower.find(kw.lower())
            if idx != -1:
                # Found a keyword, center the window around it
                start = max(0, idx - window // 2)
                end = min(len(text), idx + window // 2)
                return text[start:end]
                
        # Fallback to beginning of document
        return text[:window]

context_enrichment_service = ContextEnrichmentService()
