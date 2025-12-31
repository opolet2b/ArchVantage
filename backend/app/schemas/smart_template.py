from pydantic import BaseModel
from typing import Optional, Dict, Any, List
from datetime import datetime

# --- Global Categories ---

class SmartGlobalCategoryBase(BaseModel):
    name: str
    context: str
    active: bool = True

class SmartGlobalCategoryCreate(SmartGlobalCategoryBase):
    pass

class SmartGlobalCategoryUpdate(BaseModel):
    name: Optional[str] = None
    context: Optional[str] = None
    active: Optional[bool] = None

class SmartGlobalCategoryResponse(SmartGlobalCategoryBase):
    id: str
    created_at: datetime
    updated_at: Optional[datetime] = None
    class Config:
        from_attributes = True

# --- Taxonomy ---

class SmartTemplateTaxonomyBase(BaseModel):
    category_name: str
    activity_type: str
    input_mode: str
    description: Optional[str] = None

class SmartTemplateTaxonomyCreate(SmartTemplateTaxonomyBase):
    pass

class SmartTemplateTaxonomyUpdate(BaseModel):
    category_name: Optional[str] = None
    activity_type: Optional[str] = None
    input_mode: Optional[str] = None
    description: Optional[str] = None

class SmartTemplateTaxonomyResponse(SmartTemplateTaxonomyBase):
    id: str
    created_at: datetime
    updated_at: Optional[datetime] = None
    class Config:
        from_attributes = True

# --- Document Sections ---

class SmartTemplateDocumentSectionBase(BaseModel):
    name: str
    group_type: str
    category_name: Optional[str] = None
    expertise_level: Optional[str] = None

class SmartTemplateDocumentSectionCreate(SmartTemplateDocumentSectionBase):
    pass

class SmartTemplateDocumentSectionUpdate(BaseModel):
    name: Optional[str] = None
    group_type: Optional[str] = None
    category_name: Optional[str] = None
    expertise_level: Optional[str] = None

class SmartTemplateDocumentSectionResponse(SmartTemplateDocumentSectionBase):
    id: str
    created_at: datetime
    updated_at: Optional[datetime] = None
    class Config:
        from_attributes = True

# --- Personas ---

class SmartTemplatePersonaBase(BaseModel):
    role: str
    system_prompt: str
    tone: str

class SmartTemplatePersonaCreate(SmartTemplatePersonaBase):
    pass

class SmartTemplatePersonaUpdate(BaseModel):
    role: Optional[str] = None
    system_prompt: Optional[str] = None
    tone: Optional[str] = None

class SmartTemplatePersonaResponse(SmartTemplatePersonaBase):
    id: str
    created_at: datetime
    updated_at: Optional[datetime] = None
    class Config:
        from_attributes = True

# --- Frameworks ---

class SmartTemplateFrameworkBase(BaseModel):
    name: str
    category_name: str
    description: Optional[str] = None
    ai_specification: Optional[str] = None
    doc_url: Optional[str] = None

class SmartTemplateFrameworkCreate(SmartTemplateFrameworkBase):
    pass

class SmartTemplateFrameworkUpdate(BaseModel):
    name: Optional[str] = None
    category_name: Optional[str] = None
    description: Optional[str] = None
    ai_specification: Optional[str] = None
    doc_url: Optional[str] = None

class SmartTemplateFrameworkResponse(SmartTemplateFrameworkBase):
    id: str
    created_at: datetime
    updated_at: Optional[datetime] = None
    class Config:
        from_attributes = True

# --- Thesaurus ---

class SmartTemplateThesaurusBase(BaseModel):
    name: str
    domain: str
    source: str
    terms_mapping: Optional[Dict[str, Any]] = None

class SmartTemplateThesaurusCreate(SmartTemplateThesaurusBase):
    pass

class SmartTemplateThesaurusUpdate(BaseModel):
    name: Optional[str] = None
    domain: Optional[str] = None
    source: Optional[str] = None
    terms_mapping: Optional[Dict[str, Any]] = None

class SmartTemplateThesaurusResponse(SmartTemplateThesaurusBase):
    id: str
    created_at: datetime
    updated_at: Optional[datetime] = None
    class Config:
        from_attributes = True

# --- Rendering Types ---

class SmartRenderingTypeBase(BaseModel):
    category: str
    name: str
    description: Optional[str] = None

class SmartRenderingTypeCreate(SmartRenderingTypeBase):
    pass

class SmartRenderingTypeUpdate(BaseModel):
    category: Optional[str] = None
    name: Optional[str] = None
    description: Optional[str] = None

class SmartRenderingTypeResponse(SmartRenderingTypeBase):
    id: str
    created_at: datetime
    updated_at: Optional[datetime] = None
    class Config:
        from_attributes = True

# --- Output Formats ---

class SmartOutputFormatBase(BaseModel):
    type: str # Text, Graphics, Data
    name: str
    extension: str

class SmartOutputFormatCreate(SmartOutputFormatBase):
    pass

class SmartOutputFormatUpdate(BaseModel):
    type: Optional[str] = None
    name: Optional[str] = None
    extension: Optional[str] = None

class SmartOutputFormatResponse(SmartOutputFormatBase):
    id: str
    created_at: datetime
    updated_at: Optional[datetime] = None
    class Config:
        from_attributes = True

# --- Analysis Templates (Phase 2) ---

class SmartAnalysisTemplateBase(BaseModel):
    name: str
    category_name: str
    activity_type: str
    description: Optional[str] = None
    steps_count: int = 0
    pipeline_config: Dict[str, Any] # stores the steps, edges, etc.

class SmartAnalysisTemplateCreate(SmartAnalysisTemplateBase):
    pass

class SmartAnalysisTemplateUpdate(BaseModel):
    name: Optional[str] = None
    category_name: Optional[str] = None
    activity_type: Optional[str] = None
    description: Optional[str] = None
    steps_count: Optional[int] = None
    pipeline_config: Optional[Dict[str, Any]] = None

class SmartAnalysisTemplateResponse(SmartAnalysisTemplateBase):
    id: str
    created_at: datetime
    updated_at: Optional[datetime] = None
    class Config:
        from_attributes = True
