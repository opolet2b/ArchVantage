from pydantic import BaseModel
from typing import List, Dict, Any, Optional

class KnowledgeBaseConfigCreate(BaseModel):
    name: str
    description: Optional[str] = None
    llm_config_id: Optional[str] = None
    sources: List[Dict[str, Any]] = []
    ontology_classes: Optional[List[Dict[str, Any]]] = []
    ontology_edges: Optional[List[Dict[str, Any]]] = []
    selected_source_ids: Optional[List[str]] = []

class KnowledgeBaseConfigUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    llm_config_id: Optional[str] = None
    sources: Optional[List[Dict[str, Any]]] = None
    ontology_classes: Optional[List[Dict[str, Any]]] = None
    ontology_edges: Optional[List[Dict[str, Any]]] = None
    selected_source_ids: Optional[List[str]] = None
    status: Optional[str] = None
    ingestion_status: Optional[str] = None

class KnowledgeBaseConfigResponse(BaseModel):
    id: str
    name: str
    description: Optional[str]
    llm_config_id: Optional[str]
    sources: Optional[List[Dict[str, Any]]] = []
    ontology_classes: Optional[List[Dict[str, Any]]] = []
    ontology_edges: Optional[List[Dict[str, Any]]] = []
    selected_source_ids: Optional[List[str]] = []
    status: str
    ingestion_status: str
    node_count: int
    edge_count: int

    class Config:
        orm_mode = True
        from_attributes = True

class ExtractTaxonomyRequest(BaseModel):
    llm_config_id: str
    sources: List[Dict[str, Any]]

class ExtractPredicatesRequest(BaseModel):
    llm_config_id: str
    sources: List[Dict[str, Any]]
    approved_classes: List[Dict[str, Any]]
