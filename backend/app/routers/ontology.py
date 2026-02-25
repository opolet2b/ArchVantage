from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from typing import Dict, Any, List
from pydantic import BaseModel
from app.services.ontology_service import ontology_service
import uuid

router = APIRouter()

class ImportRequest(BaseModel):
    graph_id: str
    name: str
    nodes: List[Dict[str, Any]]
    edges: List[Dict[str, Any]]

@router.post("/ontology/upload")
async def upload_ontology(file: UploadFile = File(...)):
    """
    Endpoint to upload and parse an ontology file.
    Only supports JSON for this basic implementation.
    """
    content = await file.read()
    content_str = content.decode("utf-8")
    
    if file.filename.endswith(".json"):
        parsed_data = ontology_service.parse_json_ontology(content_str)
        return {"status": "success", "data": parsed_data}
    else:
        # Placeholder for OWL/RDF parsing
        raise HTTPException(status_code=400, detail="Only JSON format is currently supported for direct upload.")

@router.get("/ontology/{graph_id}/tree")
async def get_ontology_tree(graph_id: str):
    """
    Retrieve the current ontology tree.
    """
    tree = ontology_service.get_ontology_tree(graph_id)
    return {"status": "success", "data": tree}

@router.post("/ontology/import")
async def import_ontology(request: ImportRequest):
    """
    Save the selected/pruned ontology nodes and edges to ArcadeDB.
    """
    graph_id = request.graph_id if request.graph_id else str(uuid.uuid4())
    success = ontology_service.import_ontology(graph_id, request.name, request.nodes, request.edges)
    
    if success:
        return {"status": "success", "message": "Ontology imported successfully.", "graph_id": graph_id}
    else:
        raise HTTPException(status_code=500, detail="Failed to import ontology.")
