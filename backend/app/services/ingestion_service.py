import os
import json
import uuid
import datetime
from typing import List, Dict, Any
from app.core.arcadedb import arcadedb
from app.services.llm_service import llm_service
from app.utils.document_parser import document_parser

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
        try:
            # Update status to running
            db_kb = db.query(KnowledgeBaseConfig).filter(KnowledgeBaseConfig.id == kb_id).first()
            if not db_kb:
                print(f"[IngestionService] KB {kb_id} not found.")
                return
                
            db_kb.ingestion_status = "running"
            db.commit()

            accumulated_text = ""
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
                        accumulated_text += f"\n--- Source: {filename} ---\n{content}\n"
                except Exception as e:
                    print(f"[IngestionService] Error processing {filepath}: {e}")

            # 1. Collect sample text from sources
            for source in sources:
                source_type = source.get("type")
                path = source.get("config", {}).get("path")
                
                if source_type == "local" and path and os.path.exists(path):
                    allowed_extensions = (".txt", ".md", ".csv", ".pdf", ".docx", ".pptx")
                    
                    if os.path.isdir(path):
                        files = [f for f in os.listdir(path) if f.endswith(allowed_extensions)]
                        for filename in files[:20]: # Cap scan to 20 files
                            filepath = os.path.join(path, filename)
                            process_file(filepath, char_limit=8000)
                    elif os.path.isfile(path) and path.endswith(allowed_extensions):
                        process_file(path, char_limit=25000)

            if not accumulated_text.strip():
                if skipped_files > 0:
                    print(f"[IngestionService] {skipped_files} files skipped. No new text found for ingestion.")
                else:
                    print("[IngestionService] No text found for initial ingestion.")
                    
                db.query(KnowledgeBaseConfig).filter(KnowledgeBaseConfig.id == kb_id).update({"ingestion_status": "completed"})
                db.commit()
                return

            print(f"[IngestionService] Discovery for KB {kb_id} started. Accumulated {len(accumulated_text)} chars of text. Skipped {skipped_files} unchanged files.")

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
            - 'source' (the filename where it was found)
            
            Each relation in 'relations' must have:
            - 'source_name' (the exact 'name' of the source entity)
            - 'target_name' (the exact 'name' of the target entity)
            - 'relation_type' (must match the middle part of one of the VALID RELATIONSHIPS)
            
            Focus on the most important and representative entities and relations.
            """

            try:
                # Use up to 50,000 characters for a more thorough scan
                response_json_str = await llm_service.chat_completion(
                    system_prompt=system_prompt,
                    user_prompt=f"Identify entities and relations from the text:\n\n{accumulated_text[:50000]}",
                    model=llm_config_id,
                    json_mode=True
                )
                
                parsed_data = json.loads(llm_service._extract_json(response_json_str))
                entities = parsed_data.get("entities", [])
                relations = parsed_data.get("relations", [])
                print(f"[IngestionService] AI found {len(entities)} initial entities and {len(relations)} relations.")

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
                    ent_source = entity.get("source", "")
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
                    if not src_rid:
                        try:
                            # We don't necessarily know the type, so we query Entity and sub-types
                            # But since ArcadeDB inheritance isn't reliable currently, this fallback might miss nodes 
                            # if they were inserted in a previous run.
                            res = arcadedb.query(f"SELECT @rid FROM Entity WHERE name = :name AND graph_id = :gid LIMIT 1", params={"name": src_name, "gid": kb_id}).get("result", [])
                            if res: src_rid = res[0].get("@rid")
                        except Exception: pass
                        
                    if not tgt_rid:
                        try:
                            res = arcadedb.query(f"SELECT @rid FROM Entity WHERE name = :name AND graph_id = :gid LIMIT 1", params={"name": tgt_name, "gid": kb_id}).get("result", [])
                            if res: tgt_rid = res[0].get("@rid")
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
