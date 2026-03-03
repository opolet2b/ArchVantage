import os
import json
import uuid
import datetime
from typing import List, Dict, Any
from app.core.arcadedb import arcadedb
from app.services.llm_service import llm_service
from app.utils.document_parser import document_parser

from app.services.web_crawler_service import web_crawler_service
import hashlib

class IngestionService:
    async def discover_and_ingest_entities(self, kb_id: str, ontology_classes: List[Dict], sources: List[Dict], llm_config_id: str):
        """
        Performs an initial scan of sources to identify entities matching the curated ontology.
        Creates these entities in ArcadeDB.
        """
        from app.core.database import SessionLocal
        from app.models.knowledge_graph import KnowledgeBaseConfig
        
        db = SessionLocal()
        log_path = r"C:\Users\opole\Downloads\ChatBotn\backend\ingestion_debug.log"
        with open(log_path, "a", encoding="utf-8") as log_file:
            log_file.write(f"\n--- Ingestion Job Started: {datetime.datetime.now()} ---\n")
            log_file.write(f"KB_ID: {kb_id}, LLM: {llm_config_id}\n")
            
            try:
                # Update status to running
                db_kb = db.query(KnowledgeBaseConfig).filter(KnowledgeBaseConfig.id == kb_id).first()
                if not db_kb:
                    print(f"[IngestionService] KB {kb_id} not found.")
                    return
                    
                db_kb.ingestion_status = "running"
                db.commit()

                accumulated_text = ""
                path_mapping = {} # Map filename/marker to full path/URL
                current_hashes = db_kb.file_hashes or {}
                new_hashes = current_hashes.copy()
                skipped_files = 0
                
                def process_file(filepath: str, char_limit: int):
                    nonlocal accumulated_text, skipped_files
                    try:
                        # Calculate hash
                        with open(filepath, "rb") as f:
                            file_hash = hashlib.md5(f.read()).hexdigest()
                        
                        if current_hashes.get(filepath) == file_hash:
                            print(f"[IngestionService] Skipping {filepath} (Unchanged)")
                            skipped_files += 1
                            return
                            
                        content = document_parser.extract_text_from_file(filepath, char_limit=char_limit)
                        if content.strip():
                            new_hashes[filepath] = file_hash
                            filename = os.path.basename(filepath)
                            # Store mapping for later lookup
                            path_mapping[filename] = filepath
                            accumulated_text += f"\nSOURCE_PATH: {filename}\n{content}\n"
                    except Exception as e:
                        print(f"[IngestionService] Error processing {filepath}: {e}")

                # 1. Collect sample text from sources
                # Prioritize URL sources to ensure they aren't cut off by char limits if both are selected
                sources_sorted = sorted(sources, key=lambda x: 0 if x.get("type") == "url" else 1)
                
                for source in sources_sorted:
                    source_type = source.get("type")
                    path = source.get("config", {}).get("path")
                    
                    if source_type == "local" and path and os.path.exists(path):
                        allowed_extensions = (".txt", ".md", ".csv", ".pdf", ".docx", ".pptx", ".xml", ".xlsx", ".html", ".htm")
                        
                        if os.path.isdir(path):
                            files = [f for f in os.listdir(path) if f.endswith(allowed_extensions)]
                            for filename in files: # No arbitrary cap
                                filepath = os.path.join(path, filename)
                                process_file(filepath, char_limit=40000)
                        elif os.path.isfile(path) and path.endswith(allowed_extensions):
                            process_file(path, char_limit=100000)
                    
                    elif source_type == "url":
                        url = source.get("config", {}).get("url")
                        max_depth = int(source.get("config", {}).get("max_depth") or 1)
                        if url:
                            log_file.write(f"Crawling URL: {url} (depth={max_depth})\n")
                            # We don't populate path_mapping for URLs here because web_crawler_service 
                            # manually adds the full URLs in its internal markers.
                            content = web_crawler_service.crawl_url(url, max_depth=max_depth)
                            if content.strip():
                                log_file.write(f"Extracted {len(content)} chars from URL.\n")
                                accumulated_text += content
                            else:
                                log_file.write(f"WARNING: No content from URL {url}\n")

                if not accumulated_text.strip():
                    if skipped_files > 0:
                        print(f"[IngestionService] {skipped_files} files skipped. No new text found for ingestion.")
                    else:
                        print("[IngestionService] No text found for initial ingestion.")
                        
                    db.query(KnowledgeBaseConfig).filter(KnowledgeBaseConfig.id == kb_id).update({"ingestion_status": "completed"})
                    db.commit()
                    return

                print(f"[IngestionService] Discovery for KB {kb_id} started. Accumulated {len(accumulated_text)} chars of text. Skipped {skipped_files} unchanged files.")

                # 1.5. Vectorize Ontology into ChromaDB for Semantic Search later
                from app.services.rag_service import rag_service
                
                print(f"[IngestionService] Vectorizing Ontology for KB {kb_id} into ChromaDB...")
                for cls in ontology_classes:
                    cls_name = cls.get("name", "Unknown")
                    cls_desc = cls.get("description", "")
                    
                    # Store descriptive metadata as text to be embedded
                    ontology_text = f"Knowledge Base Ontology Class: {cls_name}. Description: {cls_desc}"
                    
                    # Attach standard metadata for filtering later in RAG search
                    v_meta = {
                        "kb_id": kb_id,
                        "type": "ontology_class",
                        "class_name": cls_name
                    }
                    try:
                        rag_service.ingest_text(ontology_text, metadata=v_meta)
                    except Exception as ve:
                        print(f"[IngestionService] Failed to vectorize ontology class {cls_name}: {ve}")
                        
                print(f"[IngestionService] Ontology vectorization complete.")

                # 2. Extract entities and relationships via LLM
                class_names = [cls.get("name") for cls in ontology_classes]
                # Get approved edges list to feed to LLM
                edges_list = [f"{e.get('source')} -> {e.get('relation')} -> {e.get('target')}" for e in db_kb.ontology_edges if e.get('approved') != False]
                
                # Map of sanitized names to original for quick check
                import re
                approved_types_sanitized = {re.sub(r'[^a-zA-Z0-9_]', '_', name.replace(" ", "_")): name for name in class_names}
                
                system_prompt = f"""
                You are a Knowledge Graph Ingestion engine. Your task is to identify specific ENTITIES (Instances) and their RELATIONSHIPS in the text based on this ontology:
                
                CLASSES: {json.dumps(class_names)}
                VALID RELATIONSHIPS: {json.dumps(edges_list)}

                Return ONLY a valid JSON object containing TWO lists: 'entities' and 'relations'.
                CRITICAL: DO NOT use markdown formatting like ```json.
                CRITICAL: DO NOT include comments or extra text. JUST THE RAW JSON OBJECT.
                
                Each entity in 'entities' must have:
                - 'name' (the specific name of the instance)
                - 'type' (must be exactly one of the provided CLASSES)
                - 'summary' (a brief description)
                - 'source' (the EXACT text found after 'SOURCE_PATH: ' or 'SOURCE_URL: ')
                
                Each relation in 'relations' must have:
                - 'source_name' (the exact 'name' of the source entity)
                - 'target_name' (the exact 'name' of the target entity)
                - 'relation_type' (must match the middle part of one of the VALID RELATIONSHIPS)
                
                Focus on the most important and representative entities and relations.
                """

                try:
                    from app.services.config_service import config_service
                    # 1. Fetch RAG config for chunking strategy
                    config = config_service.get_config()
                    rag_config = config.get("rag_config", {})
                    chunk_size = int(rag_config.get("chunk_size", 1000))
                    chunk_overlap = int(rag_config.get("chunk_overlap", 200))

                    # 2. Fetch context window limit from active preset
                    active_preset = config_service.get_preset_config(llm_config_id)
                    context_window = active_preset.get("context_window", 4096) if active_preset else 4096
                    
                    # 3. Calculate safe batch size
                    # Leave 20% buffer for prompt instructions and JSON output
                    safe_tokens = int(context_window * 0.8)
                    chunks_per_batch = max(1, safe_tokens // chunk_size)
                    print(f"[IngestionService] Chunk Size: {chunk_size}, Context Window: {context_window}.")
                    print(f"[IngestionService] Batching Strategy: {chunks_per_batch} chunks per LLM call.")

                    # 4. Split text using LlamaIndex
                    from llama_index.core.node_parser import SentenceSplitter
                    import re
                    splitter = SentenceSplitter(chunk_size=chunk_size, chunk_overlap=chunk_overlap)
                    
                    print("[IngestionService] Splitting text into chunks...")
                    text_chunks = []
                    
                    # Split the accumulated text by the source markers so we can attach them to every chunk
                    # This prevents chunks > len 1000 from losing their document attribution
                    pattern = r'[\r\n]+(SOURCE_URL: [^\r\n]+|SOURCE_PATH: [^\r\n]+)[\r\n]+'
                    parts = re.split(pattern, "\n" + accumulated_text.lstrip())
                    
                    for i in range(1, len(parts), 2):
                        if i + 1 >= len(parts):
                            break
                        marker = parts[i].strip()
                        content = parts[i+1]
                        if content and content.strip():
                            doc_chunks = splitter.split_text(content.strip())
                            for chunk in doc_chunks:
                                text_chunks.append(f"{marker}\n{chunk}")
                                
                    total_chunks = len(text_chunks)
                    print(f"[IngestionService] Total characters: {len(accumulated_text)}. Split into {total_chunks} chunks, preserving source mapping.")
                    log_file.write(f"Chunking: {len(accumulated_text)} chars split into {total_chunks} chunks ({chunk_size} sz) with preserved source.\n")

                    all_entities = []
                    all_relations = []
                    
                    # 5. Process in batches
                    for i in range(0, total_chunks, chunks_per_batch):
                        batch = text_chunks[i:i + chunks_per_batch]
                        batch_text = "\n\n--- NEXT CHUNK ---\n\n".join(batch)
                        
                        batch_num = (i // chunks_per_batch) + 1
                        total_batches = (total_chunks + chunks_per_batch - 1) // chunks_per_batch
                        
                        print(f"[IngestionService] Sending Batch {batch_num}/{total_batches} ({len(batch)} chunks, {len(batch_text)} chars) to AI...")
                        log_file.write(f"Processing Batch {batch_num}/{total_batches}...\n")
                        
                        try:
                            response_json_str = await llm_service.chat_completion(
                                system_prompt=system_prompt,
                                user_prompt=f"Identify entities and relations from the text:\n\n{batch_text}",
                                model=llm_config_id,
                                json_mode=True
                            )
                            
                            extracted_json = llm_service._extract_json(response_json_str)
                            parsed_data = json.loads(extracted_json)
                            
                            batch_entities = parsed_data.get("entities", [])
                            batch_relations = parsed_data.get("relations", [])
                            
                            all_entities.extend(batch_entities)
                            all_relations.extend(batch_relations)
                            
                            log_file.write(f"Batch {batch_num} yielded {len(batch_entities)} entities, {len(batch_relations)} relations.\n")
                        except Exception as batch_e:
                            print(f"[IngestionService] Error processing batch {batch_num}: {batch_e}")
                            log_file.write(f"Error on batch {batch_num}: {batch_e}\n")
                            # Continue to next batch even if one fails
                            continue

                    entities = all_entities
                    relations = all_relations

                    if not entities:
                        print(f"[IngestionService] WARNING: AI found 0 entities across all batches.")
                        log_file.write(f"AI found 0 entities across all batches.\n")
                    
                    log_file.write(f"Total Combined: {len(entities)} entities and {len(relations)} relations.\n")
                    print(f"[IngestionService] AI found {len(entities)} total initial entities and {len(relations)} relations.")

                    # 3. Create entities in ArcadeDB
                    now_str = datetime.datetime.now().isoformat()
                    inserted_count = 0
                    
                    # Keep track of created entities to link them later
                    # Maps entity_name -> ArcadeDB RID
                    created_nodes_map = {}

                    for entity in entities:
                        ent_name_raw = entity.get("name")
                        ent_name = ent_name_raw[0] if isinstance(ent_name_raw, list) and len(ent_name_raw) > 0 else str(ent_name_raw) if ent_name_raw else "Unnamed"
                        
                        raw_type = entity.get("type", "Entity")
                        sanitized_type = re.sub(r'[^a-zA-Z0-9_]', '_', raw_type.replace(" ", "_"))
                        
                        # Ensure type existence fallback
                        if sanitized_type not in approved_types_sanitized and sanitized_type != "Entity":
                            print(f"[IngestionService] AI returned unapproved type '{raw_type}'. Falling back to 'QuarantineEntity'.")
                            ent_type = "QuarantineEntity"
                        else:
                            ent_type = sanitized_type
                        
                        ent_summary = entity.get("summary", "")
                        ent_source_raw = str(entity.get("source", "")).strip()
                        # Clean up prefixes if the AI left them in
                        if ent_source_raw.startswith("SOURCE_PATH: "):
                            ent_source_raw = ent_source_raw.replace("SOURCE_PATH: ", "").strip()
                        elif ent_source_raw.startswith("SOURCE_URL: "):
                            ent_source_raw = ent_source_raw.replace("SOURCE_URL: ", "").strip()
                            
                        # Resolve full path via mapping if available
                        ent_source = path_mapping.get(ent_source_raw, ent_source_raw)
                        ent_uid = f"ent-{uuid.uuid4().hex[:8]}"

                        try:
                            # Check existence first to prevent duplicates
                            existing = arcadedb.query(
                                f"SELECT @rid FROM `{ent_type}` WHERE name = :name AND graph_id = :graph_id LIMIT 1", 
                                params={"name": ent_name, "graph_id": kb_id}
                            ).get("result", [])
                            
                            if existing:
                                rid = existing[0].get("@rid")
                                update_query = f"UPDATE {rid} SET summary = :summary, source_uri = :source, last_synced = :now, sync_status = 'SYNCED'"
                                arcadedb.command(update_query, params={
                                    "summary": ent_summary,
                                    "source": ent_source,
                                    "now": now_str
                                })
                                created_nodes_map[ent_name] = rid
                            else:
                                query = f"INSERT INTO `{ent_type}` SET uid = :uid, name = :name, summary = :summary, source_uri = :source, source_type = 'DOCUMENT', graph_id = :graph_id, last_synced = :now, sync_status = 'SYNCED' RETURN @rid"
                                res = arcadedb.command(query, params={
                                    "uid": ent_uid,
                                    "name": ent_name,
                                    "summary": ent_summary,
                                    "source": ent_source,
                                    "graph_id": kb_id,
                                    "now": now_str
                                })
                                
                                # Store the RID returned by the INSERT command
                                if res and isinstance(res, dict) and "result" in res and len(res["result"]) > 0:
                                    created_nodes_map[ent_name] = res["result"][0].get("@rid")
                                
                            inserted_count += 1
                        except Exception as e:
                            print(f"[IngestionService] Failed to insert entity {ent_name} of type {ent_type}: {e}")

                    # 4. Create Edges
                    edges_inserted = 0
                    for rel in relations:
                        src_name_raw = rel.get("source_name")
                        tgt_name_raw = rel.get("target_name")
                        src_name = src_name_raw[0] if isinstance(src_name_raw, list) and len(src_name_raw) > 0 else str(src_name_raw) if src_name_raw else None
                        tgt_name = tgt_name_raw[0] if isinstance(tgt_name_raw, list) and len(tgt_name_raw) > 0 else str(tgt_name_raw) if tgt_name_raw else None
                        rel_type = rel.get("relation_type", "RELATED_TO")
                        
                        if not src_name or not tgt_name:
                            continue
                            
                        src_rid = created_nodes_map.get(src_name)
                        tgt_rid = created_nodes_map.get(tgt_name)
                        
                        # If we don't have RIDs from this current batch, we have to search the DB
                        all_classes_to_check = list(approved_types_sanitized.keys()) + ["Entity", "QuarantineEntity"]
                        
                        if not src_rid:
                            for cls_name in all_classes_to_check:
                                try:
                                    res = arcadedb.query(f"SELECT @rid FROM `{cls_name}` WHERE name = :name AND graph_id = :gid LIMIT 1", params={"name": src_name, "gid": kb_id}).get("result", [])
                                    if res:
                                        src_rid = res[0].get("@rid")
                                        break
                                except Exception: pass
                                
                        if not tgt_rid:
                            for cls_name in all_classes_to_check:
                                try:
                                    res = arcadedb.query(f"SELECT @rid FROM `{cls_name}` WHERE name = :name AND graph_id = :gid LIMIT 1", params={"name": tgt_name, "gid": kb_id}).get("result", [])
                                    if res:
                                        tgt_rid = res[0].get("@rid")
                                        break
                                except Exception: pass

                        if src_rid and tgt_rid:
                            try:
                                # Create Edge
                                sanitized_rel = re.sub(r'[^a-zA-Z0-9_]', '_', rel_type.replace(" ", "_").upper())
                                edge_query = f"CREATE EDGE KNOWLEDGE_LINK FROM {src_rid} TO {tgt_rid} SET relation_type = :rtype, graph_id = :gid"
                                arcadedb.command(edge_query, params={"rtype": sanitized_rel, "gid": kb_id})
                                edges_inserted += 1
                            except Exception as e:
                                print(f"[IngestionService] Failed to insert edge {src_name} -> {tgt_name}: {e}")
                        else:
                            print(f"[IngestionService] Could not find nodes for edge: {src_name} ({src_rid}) -> {tgt_name} ({tgt_rid})")

                    print(f"[IngestionService] Successfully ingested {inserted_count} entities and {edges_inserted} edges for KB {kb_id}.")
                    # Update status
                    db.query(KnowledgeBaseConfig).filter(KnowledgeBaseConfig.id == kb_id).update({
                        "ingestion_status": "completed",
                        "node_count": KnowledgeBaseConfig.node_count + inserted_count,
                        "edge_count": KnowledgeBaseConfig.edge_count + edges_inserted,
                        "file_hashes": new_hashes
                    })
                    db.commit()

                except Exception as e:
                    import traceback
                    traceback.print_exc()
                    print(f"[IngestionService] Entity discovery failed: {e}")
                    db.query(KnowledgeBaseConfig).filter(KnowledgeBaseConfig.id == kb_id).update({"ingestion_status": "failed"})
                    db.commit()

            except Exception as e:
                print(f"[IngestionService] Ingestion task failed: {e}")
            finally:
                db.close()

ingestion_service = IngestionService()
