from fastapi import APIRouter, HTTPException, Depends, BackgroundTasks
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
def get_kb_configs(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    configs = db.query(KnowledgeBaseConfig).offset(skip).limit(limit).all()
    return configs

@router.get("/knowledge/kb/{kb_id}", response_model=KnowledgeBaseConfigResponse)
def get_kb_config(kb_id: str, db: Session = Depends(get_db)):
    config = db.query(KnowledgeBaseConfig).filter(KnowledgeBaseConfig.id == kb_id).first()
    if not config:
        raise HTTPException(status_code=404, detail="KB Config not found")
    return config

@router.post("/knowledge/kb", response_model=KnowledgeBaseConfigResponse)
def create_kb_config(kb: KnowledgeBaseConfigCreate, db: Session = Depends(get_db)):
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
    return db_kb

@router.put("/knowledge/kb/{kb_id}", response_model=KnowledgeBaseConfigResponse)
def update_kb_config(kb_id: str, kb_update: KnowledgeBaseConfigUpdate, db: Session = Depends(get_db)):
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
def delete_kb_config(kb_id: str, db: Session = Depends(get_db)):
    db_kb = db.query(KnowledgeBaseConfig).filter(KnowledgeBaseConfig.id == kb_id).first()
    if not db_kb:
        raise HTTPException(status_code=404, detail="KB Config not found")
    db.delete(db_kb)
    db.commit()
    return {"status": "success"}

# --- Extraction Endpoints ---

@router.post("/knowledge/extract-taxonomy")
async def extract_taxonomy(request: TaxonomyExtractionRequest):
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
async def extract_predicates(request: ExtractPredicatesRequest):
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
async def establish_kb_db(kb_id: str, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    db_kb = db.query(KnowledgeBaseConfig).filter(KnowledgeBaseConfig.id == kb_id).first()
    if not db_kb:
        raise HTTPException(status_code=404, detail="KB Config not found")
    
    # 0. Ensure ArcadeDB is initialized
    try:
        from app.models.knowledge_graph import init_knowledge_graph_schema
        init_knowledge_graph_schema()
    except Exception as e:
        print(f"Error initializing schema in establish_kb_db: {e}")
    
    # 1. Create specific Vertex types in ArcadeDB for each approved class
    classes = db_kb.ontology_classes or []
    approved_classes = [c for c in classes if c.get('approved') != False]
    
    import re
    for cls in approved_classes:
        # Sanitize class name consistently with IngestionService
        class_name = re.sub(r'[^a-zA-Z0-9_]', '_', cls.get('name', '').replace(' ', '_'))
        if not class_name: continue
        
        try:
            if not arcadedb.type_exists(class_name):
                arcadedb.command(f"CREATE VERTEX TYPE `{class_name}` EXTENDS Entity", silent=True)
        except Exception as e:
            pass # Handled by silent=True

    # 2. Trigger initial entity ingestion as a background task
    if approved_classes and db_kb.sources:
        background_tasks.add_task(
            ingestion_service.discover_and_ingest_entities,
            kb_id,
            approved_classes,
            db_kb.sources,
            db_kb.llm_config_id or "default"
        )

    # 3. Update status
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
def get_kb_graph(kb_id: str, db: Session = Depends(get_db)):
    """
    Returns nodes and edges from ArcadeDB for the specific Knowledge Base.
    """
    db_kb = db.query(KnowledgeBaseConfig).filter(KnowledgeBaseConfig.id == kb_id).first()
    if not db_kb:
        raise HTTPException(status_code=404, detail="KB Config not found")

    metadata = {
        "kb_id": kb_id,
        "status": db_kb.status,
        "ingestion_status": db_kb.ingestion_status or "idle"
    }

    # Fetching instance data from ArcadeDB
    # In a real scenario, we'd query by graph_id. 
    # For this implementation, we return a sample or subset if graph_id is stored in nodes.
    
    try:
        classes = db_kb.ontology_classes or []
        approved_classes = [c for c in classes if c.get('approved') != False]
        
        vertices = []
        import re
        # Explicitly fetch from each approved subclass because IF NOT EXISTS doesn't update inheritance on existing classes
        for cls in approved_classes:
            class_name = re.sub(r'[^a-zA-Z0-9_]', '_', cls.get('name', '').replace(' ', '_'))
            if class_name:
                try:
                    v_query = f"SELECT FROM `{class_name}` WHERE graph_id = '{kb_id}' LIMIT 1000"
                    res = arcadedb.query(v_query).get("result", [])
                    # Avoid duplicates if polymorphism actually worked
                    existing_rids = {v.get("@rid") for v in vertices if v.get("@rid")}
                    for node in res:
                        if node.get("@rid") not in existing_rids:
                            vertices.append(node)
                except Exception as e:
                    print(f"[KnowledgeRouter] Could not query class {class_name}: {e}")
        
        # Logging first vertex for structure debug
        if vertices:
            print(f"[KnowledgeRouter] Sample Vertex Structure: {vertices[0]}")
        
        # Fetching edges
        e_query = f"SELECT FROM KNOWLEDGE_LINK WHERE graph_id = '{kb_id}' LIMIT 2000"
        edges = arcadedb.query(e_query).get("result", [])
        
        valid_node_ids = set()
        elements = []
        for v in vertices:
            rid = v.get("@rid")
            if rid:
                valid_node_ids.add(rid)
                elements.append({
                    "group": "nodes",
                    "data": {
                        "id": rid,
                        "label": f"{v.get('name') or v.get('label') or 'Entity'}\n({v.get('@type')})",
                        "type": v.get("@type")
                    }
                })
            
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
            
        print(f"[KnowledgeRouter] Graph fetch for {kb_id}: {len(valid_node_ids)} nodes, {filtered_edges} valid edges.")
        return {"elements": elements, "metadata": metadata}
    except Exception as e:
        print(f"Graph fetch error for {kb_id}: {e}")
        # Return fallback mock if ArcadeDB is empty or unreachable for demo
        return {
            "elements": [
                { "data": { "id": 'root', "label": 'Knowledge Core (Fallback)', "type": 'System' } },
                { "data": { "id": 'n1', "label": 'Sample Entity', "type": 'Entity' } },
                { "data": { "id": 'e1', "source": 'root', "target": 'n1', "label": 'related' } }
            ],
            "metadata": { **metadata, "error": str(e) }
        }

@router.get("/knowledge/kb/{kb_id}/reconciliation/quarantine")
def get_quarantine_nodes(kb_id: str, db: Session = Depends(get_db)):
    nodes = reconciliation_service.get_quarantine_nodes(kb_id)
    return {"quarantine_items": nodes}

@router.post("/knowledge/kb/{kb_id}/reconciliation/align")
def align_quarantine_node(kb_id: str, req: AlignRequest, db: Session = Depends(get_db)):
    success = reconciliation_service.align_node(kb_id, req.node_id, req.target_class)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to align node.")
    return {"status": "success"}
