from sqlalchemy import Column, String, Integer, Boolean, ForeignKey, JSON, DateTime, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base
import uuid

def generate_uuid():
    return str(uuid.uuid4())

class SmartGlobalCategory(Base):
    __tablename__ = "smart_global_categories"
    
    id = Column(String, primary_key=True, default=generate_uuid)
    name = Column(String, nullable=False)
    context = Column(String, nullable=False)  # Taxonomy, Doc Sections, Frameworks, AI Personas
    active = Column(Boolean, default=True)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

class SmartTemplateTaxonomy(Base):
    __tablename__ = "smart_template_taxonomies"
    
    id = Column(String, primary_key=True, default=generate_uuid)
    category_name = Column(String, nullable=False) # Linked to SmartGlobalCategory by name or loose coupling
    activity_type = Column(String, nullable=False)
    input_mode = Column(String, nullable=False) # Single, Multi
    description = Column(Text, nullable=True)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

class SmartTemplateDocumentSection(Base):
    __tablename__ = "smart_template_sections"
    
    id = Column(String, primary_key=True, default=generate_uuid)
    name = Column(String, nullable=False)
    group_type = Column(String, nullable=False) # Generic, Domain-Specific
    category_name = Column(String, nullable=True) # If Domain-Specific, linked to GlobalCategory
    expertise_level = Column(String, nullable=True) # For Generic
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

class SmartTemplatePersona(Base):
    __tablename__ = "smart_template_personas"
    
    id = Column(String, primary_key=True, default=generate_uuid)
    role = Column(String, nullable=False)
    system_prompt = Column(Text, nullable=False)
    tone = Column(String, nullable=False)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

class SmartTemplateFramework(Base):
    __tablename__ = "smart_template_frameworks"
    
    id = Column(String, primary_key=True, default=generate_uuid)
    name = Column(String, nullable=False)
    category_name = Column(String, nullable=False) # Linked to GlobalCategory
    description = Column(Text, nullable=True)
    ai_specification = Column(Text, nullable=True) # Analysis Rules
    doc_url = Column(String, nullable=True)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

class SmartTemplateThesaurus(Base):
    __tablename__ = "smart_template_thesauruses"
    
    id = Column(String, primary_key=True, default=generate_uuid)
    name = Column(String, nullable=False)
    domain = Column(String, nullable=False)
    source = Column(String, nullable=False)
    terms_mapping = Column(JSON, nullable=True) # {"term": "definition"}
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

class SmartRenderingType(Base):
    __tablename__ = "smart_rendering_types"

    id = Column(String, primary_key=True, default=generate_uuid)
    category = Column(String, nullable=False) # Text, Table, Picture, Diagram, Combination
    name = Column(String, nullable=False) # e.g. "Single Sentence", "Pie Chart"
    description = Column(Text, nullable=True)
    react_component = Column(String, nullable=True)
    config_schema = Column(JSON, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

class SmartOutputFormat(Base):
    __tablename__ = "smart_output_formats"

    id = Column(String, primary_key=True, default=generate_uuid)
    type = Column(String, nullable=False) # Text, Graphics, Data
    name = Column(String, nullable=False) # e.g. ".pdf", "Mermaid Code"
    extension = Column(String, nullable=False) # e.g. "pdf"
    content_type = Column(String, nullable=True)
    structure_template = Column(JSON, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

# Placeholder for Phase 2
class SmartAnalysisTemplate(Base):
    __tablename__ = "smart_analysis_templates"
    
    id = Column(String, primary_key=True, default=generate_uuid)
    name = Column(String, nullable=False)
    category_name = Column(String, nullable=False)
    activity_type = Column(String, nullable=False) # Linked to Taxonomy
    description = Column(Text, nullable=True)
    steps_count = Column(Integer, default=0)
    pipeline_config = Column(JSON, nullable=False) # The full JSON structure
    document_template_id = Column(String, nullable=True) # Linked to generic Template (Markdown Blueprint)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
