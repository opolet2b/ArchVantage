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
    async def enrich_context(self, query: str, kb_id: Optional[str], db: Session, active_model: str = "default") -> str:
        if not kb_id or kb_id == "none" or kb_id == "--NONE--":
            return ""
            
        # 1. Check if KB exists
        db_kb = db.query(KnowledgeBaseConfig).filter(KnowledgeBaseConfig.id == kb_id).first()
        if not db_kb or db_kb.status != "active":
            return ""
            
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
            
        print(f"[ContextEnrichment] Searching KB {kb_id} for keywords: {keywords}")
        
        # 3. Semantic Search in ChromaDB to find relevant Ontology Classes
        from app.services.rag_service import rag_service
        
        # We search ChromaDB exclusively for embedded ontology classes for this KB
        # This naturally handles cross-lingual queries and conceptual mapping
        try:
             semantic_results = rag_service.search(
                 query, 
                 filters={"kb_id": kb_id, "type": "ontology_class"}, 
                 k=5
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
        
        # 4. Search ArcadeDB for nodes instantiated under these semantic classes
        matched_nodes = []
        for cls_name in matched_classes + ["Entity"]:
            try:
                # First try to find nodes in this class that explicitly match keywords
                for kw in keywords:
                     if len(kw) < 3: continue
                     db_query = f"SELECT FROM `{cls_name}` WHERE graph_id = :gid AND (name.toLowerCase() LIKE :kw OR summary.toLowerCase() LIKE :kw) LIMIT 5"
                     res = arcadedb.query(db_query, params={
                         "gid": kb_id,
                         "kw": f"%{kw.lower()}%"
                     }).get("result", [])
                     matched_nodes.extend(res)
                
                # If still no keyword matches, just grab the top instances of this class
                # since the semantic query already determined this class is highly relevant!
                if not matched_nodes:
                     db_query_fallback = f"SELECT FROM `{cls_name}` WHERE graph_id = :gid LIMIT 3"
                     res_fb = arcadedb.query(db_query_fallback, params={"gid": kb_id}).get("result", [])
                     matched_nodes.extend(res_fb)
            except Exception as e:
                pass
        
        # Deduplicate nodes based on RID
        unique_nodes = {n.get("@rid"): n for n in matched_nodes if n.get("@rid")}.values()
        
        if not unique_nodes:
            return ""
            
        print(f"[ContextEnrichment] Found {len(unique_nodes)} matching KB nodes.")
        
        # 4. Fetch related external content
        enriched_blocks = []
        sources_fetched = set()
        
        for node in list(unique_nodes)[:10]:  # Limit to top 10
            name = node.get("name", "Unknown")
            ntype = node.get("@type", "Entity")
            summary = node.get("summary", "")
            source_uri = node.get("source_uri")
            
            node_context = f"### KB Entity: {name} ({ntype})\n**Summary:** {summary}\n"
            
            # Fetch external content if valid
            if source_uri and source_uri not in sources_fetched:
                sources_fetched.add(source_uri)
                try:
                    ext_content = ""
                    if source_uri.startswith("http"):
                        # Fetch URL (limit depth to 0 for quick context)
                        ext_content = web_crawler_service.crawl_url(source_uri, max_depth=0)
                    elif os.path.exists(source_uri):
                        # Fetch file
                        ext_content = document_parser.extract_text_from_file(source_uri, char_limit=4000)
                        
                    if ext_content:
                        # Chunk the text roughly around the keywords
                        snippet = self._find_best_snippet(ext_content, keywords)
                        if snippet:
                             node_context += f"**Source Snippet ([Source: {source_uri}]):**\n{snippet}...\n"
                except Exception as e:
                    print(f"[ContextEnrichment] Failed to fetch source {source_uri}: {e}")
                    
            enriched_blocks.append(node_context)
            
        if not enriched_blocks:
            return ""
            
        final_context = "\n\n--- KNOWLEDGE BASE CONTEXT ---\n" + "\n\n".join(enriched_blocks) + "\n--------------------------------\n"
        return final_context
        
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
