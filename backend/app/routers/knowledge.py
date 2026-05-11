import datetime
from fastapi import APIRouter, HTTPException, Depends, BackgroundTasks, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import List, Dict, Any
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.models.knowledge_graph import KnowledgeBaseConfig
from app.schemas.knowledge_schemas import (
    KnowledgeBaseConfigCreate,
    KnowledgeBaseConfigUpdate,
    KnowledgeBaseConfigResponse,
    ExtractTaxonomyRequest,
    ExtractPredicatesRequest
)
from app.services.search_service import search_service
from app.services.ontology_service import ontology_service
from app.services.mcp_integration_service import mcp_integration_service
from app.services.ingestion_service import ingestion_service
from app.services.reconciliation_service import reconciliation_service
from app.core.arcadedb import arcadedb
from app.services.debug_service import debug_service
from app.routers.auth import get_current_active_user, PermissionChecker
from app.models.user import User

router = APIRouter()

class SearchRequest(BaseModel):
    query: str

class SyncRequest(BaseModel):
    node_uid: str

class TaxonomyExtractionRequest(BaseModel):
    llm_config_id: str
    sources: List[Dict[str, Any]]

class AlignRequest(BaseModel):
    node_id: str
    target_class: str

@router.post("/knowledge")
async def knowledge_endpoint(request: SearchRequest):
    result = search_service.search(request.query)
    return {"result": result}

# --- KB Configuration Endpoints ---

@router.get("/knowledge/kb", response_model=List[KnowledgeBaseConfigResponse])
def get_kb_configs(skip: int = 0, limit: int = 100, db: Session = Depends(get_db), current_user: User = Depends(get_current_active_user)):
    configs = db.query(KnowledgeBaseConfig).offset(skip).limit(limit).all()
    return configs

@router.get("/knowledge/kb/{kb_id}", response_model=KnowledgeBaseConfigResponse)
def get_kb_config(kb_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_active_user)):
    config = db.query(KnowledgeBaseConfig).filter(KnowledgeBaseConfig.id == kb_id).first()
    if not config:
        raise HTTPException(status_code=404, detail="KB Config not found")
    return config

@router.post("/knowledge/kb", response_model=KnowledgeBaseConfigResponse)
def create_kb_config(kb: KnowledgeBaseConfigCreate, db: Session = Depends(get_db), current_user: User = Depends(PermissionChecker("kb:manage"))):
    db_kb = KnowledgeBaseConfig(
        name=kb.name,
        description=kb.description,
        llm_config_id=kb.llm_config_id,
        sources=kb.sources,
        ontology_classes=kb.ontology_classes,
        ontology_edges=kb.ontology_edges,
        selected_source_ids=kb.selected_source_ids
    )
    db.add(db_kb)
    db.commit()
    db.refresh(db_kb)
    debug_service.log("INFO", "Knowledge Base", "Config", f"Created KB config: {db_kb.name} ({db_kb.id})")
    return db_kb

@router.put("/knowledge/kb/{kb_id}", response_model=KnowledgeBaseConfigResponse)
def update_kb_config(kb_id: str, kb_update: KnowledgeBaseConfigUpdate, db: Session = Depends(get_db), current_user: User = Depends(PermissionChecker("kb:manage"))):
    db_kb = db.query(KnowledgeBaseConfig).filter(KnowledgeBaseConfig.id == kb_id).first()
    if not db_kb:
        raise HTTPException(status_code=404, detail="KB Config not found")
    
    update_data = kb_update.dict(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_kb, key, value)
    
    db.commit()
    db.refresh(db_kb)
    return db_kb

@router.delete("/knowledge/kb/{kb_id}")
def delete_kb_config(kb_id: str, db: Session = Depends(get_db), current_user: User = Depends(PermissionChecker("kb:manage"))):
    db_kb = db.query(KnowledgeBaseConfig).filter(KnowledgeBaseConfig.id == kb_id).first()
    if not db_kb:
        raise HTTPException(status_code=404, detail="KB Config not found")
    db.delete(db_kb)
    db.commit()
    return {"status": "success"}

# --- Extraction Endpoints ---

@router.post("/knowledge/extract-taxonomy")
async def extract_taxonomy(request: TaxonomyExtractionRequest, current_user: User = Depends(PermissionChecker("kb:manage"))):
    try:
        # Instead of awaiting and returning dict, return a StreamingResponse 
        # that consumes the async generator from ontology_service
        return StreamingResponse(
            ontology_service.extract_taxonomy_from_sources(request.sources, request.llm_config_id),
            media_type="text/event-stream"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/knowledge/extract-predicates")
async def extract_predicates(request: ExtractPredicatesRequest, current_user: User = Depends(PermissionChecker("kb:manage"))):
    """
    Kicks off an async background extraction process that reads the supplied 
    sources and uses the prompt to find relationships for the approved_classes.
    Returns a text/event-stream of progress statuses.
    """
    if not request.sources:
        raise HTTPException(status_code=400, detail="No sources provided for extraction.")
    if not request.llm_config_id:
        raise HTTPException(status_code=400, detail="An LLM Configuration must be selected.")
    if not request.approved_classes:
        raise HTTPException(status_code=400, detail="Approved classes are required to extract predicates.")

    return StreamingResponse(
        ontology_service.extract_predicates_from_sources(request.sources, request.approved_classes, request.llm_config_id),
        media_type="text/event-stream"
    )

@router.post("/knowledge/kb/{kb_id}/establish")
async def establish_kb_db(kb_id: str, background_tasks: BackgroundTasks, force: bool = False, db: Session = Depends(get_db), current_user: User = Depends(PermissionChecker("kb:manage"))):
    db_kb = db.query(KnowledgeBaseConfig).filter(KnowledgeBaseConfig.id == kb_id).first()
    if not db_kb:
        raise HTTPException(status_code=404, detail="KB Config not found")
    
    log_path = r"C:\Users\opole\Downloads\ChatBotn\backend\establish_debug.log"
    with open(log_path, "a", encoding="utf-8") as f:
        f.write(f"\n--- Establish Started: {datetime.datetime.now()} for KB {kb_id} (force={force}) ---\n")
        
        # 0. Ensure ArcadeDB is initialized
        try:
            from app.models.knowledge_graph import init_knowledge_graph_schema
            f.write("Initializing base schema...\n")
            init_knowledge_graph_schema()
            f.write("Base schema initialized.\n")
        except Exception as e:
            f.write(f"Error initializing schema: {e}\n")
        
        # 1. Create specific Vertex types in ArcadeDB for each approved class
        classes = db_kb.ontology_classes or []
        approved_classes = [c for c in classes if c.get('approved') != False]
        
        import re
        for cls in approved_classes:
            class_name = re.sub(r'[^a-zA-Z0-9_]', '_', cls.get('name', '').replace(' ', '_'))
            if not class_name: continue
            
            try:
                if not arcadedb.type_exists(class_name):
                    f.write(f"Creating type: {class_name}\n")
                    arcadedb.command(f"CREATE VERTEX TYPE `{class_name}` EXTENDS Entity", silent=True)
            except Exception as e:
                f.write(f"Error on type {class_name}: {e}\n")
        
        f.write(f"Starting background ingestion for {len(approved_classes)} classes...\n")
        # 2. Trigger initial entity ingestion as a background task
        # ... (rest of code follows outside this block but I need to wrap it or just keep the log open)


    # 2. Trigger initial entity ingestion as a background task
    selected_sources = [s for s in db_kb.sources if s.get('id') in (db_kb.selected_source_ids or [])]
    if not selected_sources:
        selected_sources = db_kb.sources # fallback
        
    if approved_classes and selected_sources:
        # Clear file hashes ONLY if forced or if it's the very first time (status not active)
        if force or db_kb.status != "active":
            print(f"[Establish] Clearing file hashes for KB {kb_id} (force={force}, status={db_kb.status})")
            db_kb.file_hashes = {}
        else:
            print(f"[Establish] Preserving existing file hashes for incremental update of KB {kb_id}")
        
        background_tasks.add_task(
            ingestion_service.discover_and_ingest_entities,
            kb_id,
            approved_classes,
            selected_sources,
            db_kb.llm_config_id or "default"
        )
    else:
        pass

    # 3. Update status
    debug_service.log("INFO", "Knowledge Base", "Establish", f"Starting background ingestion for {kb_id} status=active")
    db_kb.status = "active"
    db.commit()
    db.refresh(db_kb)
    
    return {"status": "success", "message": f"Schema established for {len(approved_classes)} classes. Background ingestion started."}

@router.post("/knowledge/kb/{kb_id}/lazy-update")
async def trigger_lazy_update(kb_id: str, request: SyncRequest):
    """
    Trigger a lazy update for a specific node.
    """
    success = mcp_integration_service.sync_node(request.node_uid)
    if not success:
        raise HTTPException(status_code=500, detail="Lazy update failed")
    return {"status": "success"}

@router.get("/knowledge/kb/{kb_id}/graph")
def get_kb_graph(
    kb_id: str, 
    perspective: str = "relational", 
    sources: List[str] = Query(None),
    classes: List[str] = Query(None),
    db: Session = Depends(get_db)
):
    """
    Returns nodes and edges from ArcadeDB for the specific Knowledge Base.
    Perspective can be 'relational' (default) or 'hierarchical'.
    'sources' is an optional list of source_uri prefixes to filter by.
    'classes' is an optional list of Ontology Classes to filter by.
    """
    db_kb = db.query(KnowledgeBaseConfig).filter(KnowledgeBaseConfig.id == kb_id).first()
    if not db_kb:
        raise HTTPException(status_code=404, detail="KB Config not found")

    metadata = {
        "kb_id": kb_id,
        "status": db_kb.status,
        "ingestion_status": db_kb.ingestion_status or "idle",
        "perspective": perspective
    }

    try:
        all_classes = db_kb.ontology_classes or []
        approved_classes = [c for c in all_classes if c.get('approved') != False]
        
        # Apply the frontend class filter if provided
        if classes is not None:
            if "--NONE--" in classes:
                approved_classes = [] # Explicitly empty
            elif len(classes) > 0:
                approved_classes = [c for c in approved_classes if c.get('name') in classes]
        
        vertices = []
        import re
        for cls in approved_classes:
            class_name = re.sub(r'[^a-zA-Z0-9_]', '_', cls.get('name', '').replace(' ', '_'))
            if class_name:
                try:
                    if not arcadedb.type_exists(class_name):
                        continue
                        
                    v_query = f"SELECT FROM `{class_name}` WHERE graph_id = :kb_id"
                    params = {"kb_id": kb_id}
                    
                    if sources:
                        # Build an OR clause for multiple sources
                        source_conditions = []
                        import urllib.parse
                        for i, src_prefix in enumerate(sources):
                            param_key = f"src_{i}"
                            
                            # If it's a URL, we used to just match by domain. However, this causes 
                            # two DIFFERENT sources on the same domain (like /pageA vs /pageB) to overlap. 
                            # Instead, we should match the prefix of the URL so that sub-pages are caught
                            # but different base directories aren't accidentally conflated.
                            if src_prefix.startswith('http'):
                                source_conditions.append(f"source_uri LIKE :{param_key}")
                                params[param_key] = f"{src_prefix}%"
                            else:
                                # For local files, keep the strict prefix match
                                source_conditions.append(f"source_uri LIKE :{param_key}")
                                params[param_key] = f"{src_prefix}%"
                        
                        v_query += f" AND ({' OR '.join(source_conditions)})"
                    
                    v_query += " LIMIT 1000"
                    res = arcadedb.query(v_query, params=params).get("result", [])
                    existing_rids = {v.get("@rid") for v in vertices if v.get("@rid")}
                    for node in res:
                        if node.get("@rid") not in existing_rids:
                            vertices.append(node)
                except Exception as e:
                    print(f"[KnowledgeRouter] Could not query class {class_name}: {e}")
        
        elements = []
        
        if perspective == "hierarchical":
            sources = set()
            types_by_source = {} # source -> set of types
            instances = []
            
            for v in vertices:
                rid = v.get("@rid")
                if not rid: continue
                
                source = v.get("source_uri") or "Unknown Source"
                v_type = v.get("@type") or "Entity"
                
                sources.add(source)
                if source not in types_by_source:
                    types_by_source[source] = set()
                types_by_source[source].add(v_type)
                
                instances.append({
                    "id": rid,
                    "label": f"{v.get('name') or v.get('label') or 'Unnamed'}",
                    "type": "Instance",
                    "original_type": v_type,
                    "source": source
                })
            
            # Create Source Nodes
            for src in sources:
                src_node_id = f"src_{hash(src)}"
                elements.append({
                    "group": "nodes",
                    "data": { "id": src_node_id, "label": f"Source: {src}", "type": "SourceDocument", "color": "#cbd5e1" } # generic gray
                })
                
                # Create Type Nodes under this source
                for t in types_by_source[src]:
                    type_node_id = f"type_{hash(src)}_{hash(t)}"
                    elements.append({
                        "group": "nodes",
                        "data": { "id": type_node_id, "label": f"Class: {t}", "type": "EntityType", "color": "#94a3b8" } # darker gray
                    })
                    # Link Source -> Type
                    elements.append({
                        "group": "edges",
                        "data": {
                            "id": f"edge_{src_node_id}_{type_node_id}",
                            "source": src_node_id,
                            "target": type_node_id,
                            "label": "CONTAINS"
                        }
                    })
            
            # Create Instance Nodes and link to their Type node
            for inst in instances:
                src_node_id = f"src_{hash(inst['source'])}"
                type_node_id = f"type_{hash(inst['source'])}_{hash(inst['original_type'])}"
                
                elements.append({
                    "group": "nodes",
                    "data": {
                        "id": inst["id"],
                        "label": f"{inst['label']}\n({inst['original_type']})",
                        "type": inst["original_type"], # Keep original for coloring
                        "properties": {k: val for k, val in v.items() if not k.startswith('@') and k not in ['in_', 'out_']}
                    }
                })
                
                elements.append({
                    "group": "edges",
                    "data": {
                        "id": f"edge_{type_node_id}_{inst['id']}",
                        "source": type_node_id,
                        "target": inst["id"],
                        "label": "INSTANCE_OF"
                    }
                })
                
            print(f"[KnowledgeRouter] Hierarchical Graph fetch for {kb_id}: {len(sources)} sources, {sum(len(t) for t in types_by_source.values())} type nodes, {len(instances)} instances.")

        else:
            # RELATIONAL (Default)
            valid_node_ids = set()
            for v in vertices:
                rid = v.get("@rid")
                if rid:
                    valid_node_ids.add(rid)
                    elements.append({
                        "group": "nodes",
                        "data": {
                            "id": rid,
                            "label": f"{v.get('name') or v.get('label') or 'Entity'}\n({v.get('@type')})",
                            "type": v.get("@type"),
                            "properties": {k: val for k, val in v.items() if not k.startswith('@') and k not in ['in_', 'out_']}
                        }
                    })
                
            e_query = f"SELECT FROM KNOWLEDGE_LINK WHERE graph_id = '{kb_id}' LIMIT 2000"
            edges = arcadedb.query(e_query).get("result", [])
            
            filtered_edges = 0
            for e in edges:
                src = e.get("@out") or e.get("out")
                tgt = e.get("@in") or e.get("in")
                if src in valid_node_ids and tgt in valid_node_ids:
                    filtered_edges += 1
                    elements.append({
                        "group": "edges",
                        "data": {
                            "id": e.get("@rid"),
                            "source": src,
                            "target": tgt,
                            "label": e.get("relation_type") or "link"
                        }
                    })
            print(f"[KnowledgeRouter] Relational Graph fetch for {kb_id}: {len(valid_node_ids)} nodes, {filtered_edges} valid edges.")

        return {"elements": elements, "metadata": metadata}
    except Exception as e:
        print(f"Graph fetch error for {kb_id}: {e}")
        # Return empty graph with error metadata if ArcadeDB is unreachable or uninitialized
        return {
            "elements": [],
            "metadata": { **metadata, "error": "Database not initialized or unreachable." }
        }

@router.get("/knowledge/kb/{kb_id}/reconciliation/quarantine")
def get_quarantine_nodes(kb_id: str, db: Session = Depends(get_db)):
    nodes = reconciliation_service.get_quarantine_nodes(kb_id)
    return {"quarantine_items": nodes}

@router.post("/knowledge/kb/{kb_id}/reconciliation/align")
def align_quarantine_node(kb_id: str, req: AlignRequest, db: Session = Depends(get_db), current_user: User = Depends(PermissionChecker("kb:manage"))):
    success = reconciliation_service.align_node(kb_id, req.node_id, req.target_class)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to align node.")
    return {"status": "success"}
