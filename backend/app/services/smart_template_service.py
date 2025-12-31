from sqlalchemy.orm import Session
from typing import List, Optional
from app.models import smart_template as models
from app.schemas import smart_template as schemas

class SmartTemplateService:
    
    # --- Global Categories ---
    
    def get_global_categories(self, db: Session, context: Optional[str] = None) -> List[models.SmartGlobalCategory]:
        query = db.query(models.SmartGlobalCategory)
        if context:
            query = query.filter(models.SmartGlobalCategory.context == context)
        return query.all()

    def create_global_category(self, db: Session, item: schemas.SmartGlobalCategoryCreate) -> models.SmartGlobalCategory:
        db_item = models.SmartGlobalCategory(**item.dict())
        db.add(db_item)
        db.commit()
        db.refresh(db_item)
        return db_item

    def update_global_category(self, db: Session, item_id: str, item: schemas.SmartGlobalCategoryUpdate) -> Optional[models.SmartGlobalCategory]:
        db_item = db.query(models.SmartGlobalCategory).filter(models.SmartGlobalCategory.id == item_id).first()
        if not db_item:
            return None
        
        for key, value in item.dict(exclude_unset=True).items():
            setattr(db_item, key, value)
        
        db.commit()
        db.refresh(db_item)
        return db_item

    def delete_global_category(self, db: Session, item_id: str) -> bool:
        db_item = db.query(models.SmartGlobalCategory).filter(models.SmartGlobalCategory.id == item_id).first()
        if not db_item:
            return False
            
        # Check usage dependencies
        # 1. Check Taxonomies
        if db.query(models.SmartTemplateTaxonomy).filter(models.SmartTemplateTaxonomy.category_name == db_item.name).first():
            return False
        # 2. Check Document Sections
        if db.query(models.SmartTemplateDocumentSection).filter(models.SmartTemplateDocumentSection.category_name == db_item.name).first():
            return False
        # 3. Check Frameworks
        if db.query(models.SmartTemplateFramework).filter(models.SmartTemplateFramework.category_name == db_item.name).first():
            return False
            
        db.delete(db_item)
        db.commit()
        return True

    # --- Taxonomies ---

    def get_taxonomies(self, db: Session) -> List[models.SmartTemplateTaxonomy]:
        return db.query(models.SmartTemplateTaxonomy).all()

    def create_taxonomy(self, db: Session, item: schemas.SmartTemplateTaxonomyCreate) -> models.SmartTemplateTaxonomy:
        db_item = models.SmartTemplateTaxonomy(**item.dict())
        db.add(db_item)
        db.commit()
        db.refresh(db_item)
        return db_item

    def update_taxonomy(self, db: Session, item_id: str, item: schemas.SmartTemplateTaxonomyUpdate) -> Optional[models.SmartTemplateTaxonomy]:
        db_item = db.query(models.SmartTemplateTaxonomy).filter(models.SmartTemplateTaxonomy.id == item_id).first()
        if not db_item:
            return None
        for key, value in item.dict(exclude_unset=True).items():
            setattr(db_item, key, value)
        db.commit()
        db.refresh(db_item)
        return db_item

    def delete_taxonomy(self, db: Session, item_id: str) -> bool:
        db_item = db.query(models.SmartTemplateTaxonomy).filter(models.SmartTemplateTaxonomy.id == item_id).first()
        if not db_item:
            return False
        db.delete(db_item)
        db.commit()
        return True

    # --- Document Sections ---

    def get_sections(self, db: Session) -> List[models.SmartTemplateDocumentSection]:
        return db.query(models.SmartTemplateDocumentSection).all()

    def create_section(self, db: Session, item: schemas.SmartTemplateDocumentSectionCreate) -> models.SmartTemplateDocumentSection:
        db_item = models.SmartTemplateDocumentSection(**item.dict())
        db.add(db_item)
        db.commit()
        db.refresh(db_item)
        return db_item

    def update_section(self, db: Session, item_id: str, item: schemas.SmartTemplateDocumentSectionUpdate) -> Optional[models.SmartTemplateDocumentSection]:
        db_item = db.query(models.SmartTemplateDocumentSection).filter(models.SmartTemplateDocumentSection.id == item_id).first()
        if not db_item:
            return None
        for key, value in item.dict(exclude_unset=True).items():
            setattr(db_item, key, value)
        db.commit()
        db.refresh(db_item)
        return db_item

    def delete_section(self, db: Session, item_id: str) -> bool:
        db_item = db.query(models.SmartTemplateDocumentSection).filter(models.SmartTemplateDocumentSection.id == item_id).first()
        if not db_item:
            return False
        db.delete(db_item)
        db.commit()
        return True

    # --- Personas ---

    def get_personas(self, db: Session) -> List[models.SmartTemplatePersona]:
        return db.query(models.SmartTemplatePersona).all()

    def create_persona(self, db: Session, item: schemas.SmartTemplatePersonaCreate) -> models.SmartTemplatePersona:
        db_item = models.SmartTemplatePersona(**item.dict())
        db.add(db_item)
        db.commit()
        db.refresh(db_item)
        return db_item

    def update_persona(self, db: Session, item_id: str, item: schemas.SmartTemplatePersonaUpdate) -> Optional[models.SmartTemplatePersona]:
        db_item = db.query(models.SmartTemplatePersona).filter(models.SmartTemplatePersona.id == item_id).first()
        if not db_item:
            return None
        for key, value in item.dict(exclude_unset=True).items():
            setattr(db_item, key, value)
        db.commit()
        db.refresh(db_item)
        return db_item

    def delete_persona(self, db: Session, item_id: str) -> bool:
        db_item = db.query(models.SmartTemplatePersona).filter(models.SmartTemplatePersona.id == item_id).first()
        if not db_item:
            return False
        db.delete(db_item)
        db.commit()
        return True

    # --- Frameworks ---

    def get_frameworks(self, db: Session) -> List[models.SmartTemplateFramework]:
        return db.query(models.SmartTemplateFramework).all()

    def create_framework(self, db: Session, item: schemas.SmartTemplateFrameworkCreate) -> models.SmartTemplateFramework:
        db_item = models.SmartTemplateFramework(**item.dict())
        db.add(db_item)
        db.commit()
        db.refresh(db_item)
        return db_item

    def update_framework(self, db: Session, item_id: str, item: schemas.SmartTemplateFrameworkUpdate) -> Optional[models.SmartTemplateFramework]:
        db_item = db.query(models.SmartTemplateFramework).filter(models.SmartTemplateFramework.id == item_id).first()
        if not db_item:
            return None
        for key, value in item.dict(exclude_unset=True).items():
            setattr(db_item, key, value)
        db.commit()
        db.refresh(db_item)
        return db_item

    def delete_framework(self, db: Session, item_id: str) -> bool:
        db_item = db.query(models.SmartTemplateFramework).filter(models.SmartTemplateFramework.id == item_id).first()
        if not db_item:
            return False
        db.delete(db_item)
        db.commit()
        return True

    # --- Thesauruses ---

    def get_thesauruses(self, db: Session) -> List[models.SmartTemplateThesaurus]:
        return db.query(models.SmartTemplateThesaurus).all()

    def create_thesaurus(self, db: Session, item: schemas.SmartTemplateThesaurusCreate) -> models.SmartTemplateThesaurus:
        db_item = models.SmartTemplateThesaurus(**item.dict())
        db.add(db_item)
        db.commit()
        db.refresh(db_item)
        return db_item

    def update_thesaurus(self, db: Session, item_id: str, item: schemas.SmartTemplateThesaurusUpdate) -> Optional[models.SmartTemplateThesaurus]:
        db_item = db.query(models.SmartTemplateThesaurus).filter(models.SmartTemplateThesaurus.id == item_id).first()
        if not db_item:
            return None
        for key, value in item.dict(exclude_unset=True).items():
            setattr(db_item, key, value)
        db.commit()
        db.refresh(db_item)
        return db_item

    def delete_thesaurus(self, db: Session, item_id: str) -> bool:
        db_item = db.query(models.SmartTemplateThesaurus).filter(models.SmartTemplateThesaurus.id == item_id).first()
        if not db_item:
            return False
        db.delete(db_item)
        db.commit()
        return True

    # --- Analysis Templates (Phase 2) ---

    def get_templates(self, db: Session) -> List[models.SmartAnalysisTemplate]:
        return db.query(models.SmartAnalysisTemplate).all()

    def create_template(self, db: Session, item: schemas.SmartAnalysisTemplateCreate) -> models.SmartAnalysisTemplate:
        db_item = models.SmartAnalysisTemplate(**item.dict())
        db.add(db_item)
        db.commit()
        db.refresh(db_item)
        return db_item

    def get_template_by_id(self, db: Session, item_id: str) -> Optional[models.SmartAnalysisTemplate]:
        return db.query(models.SmartAnalysisTemplate).filter(models.SmartAnalysisTemplate.id == item_id).first()

    def update_template(self, db: Session, item_id: str, item: schemas.SmartAnalysisTemplateUpdate) -> Optional[models.SmartAnalysisTemplate]:
        db_item = db.query(models.SmartAnalysisTemplate).filter(models.SmartAnalysisTemplate.id == item_id).first()
        if not db_item:
            return None
        for key, value in item.dict(exclude_unset=True).items():
            setattr(db_item, key, value)
        db.commit()
        db.refresh(db_item)
        return db_item

    def delete_template(self, db: Session, item_id: str) -> bool:
        db_item = db.query(models.SmartAnalysisTemplate).filter(models.SmartAnalysisTemplate.id == item_id).first()
        if not db_item:
            return False
        db.delete(db_item)
        db.commit()
        return True

    # --- Rendering Types ---

    def get_rendering_types(self, db: Session) -> List[models.SmartRenderingType]:
        return db.query(models.SmartRenderingType).all()

    def create_rendering_type(self, db: Session, item: schemas.SmartRenderingTypeCreate) -> models.SmartRenderingType:
        db_item = models.SmartRenderingType(**item.dict())
        db.add(db_item)
        db.commit()
        db.refresh(db_item)
        return db_item

    def update_rendering_type(self, db: Session, item_id: str, item: schemas.SmartRenderingTypeUpdate) -> Optional[models.SmartRenderingType]:
        db_item = db.query(models.SmartRenderingType).filter(models.SmartRenderingType.id == item_id).first()
        if not db_item:
            return None
        for key, value in item.dict(exclude_unset=True).items():
            setattr(db_item, key, value)
        db.commit()
        db.refresh(db_item)
        return db_item

    def delete_rendering_type(self, db: Session, item_id: str) -> bool:
        db_item = db.query(models.SmartRenderingType).filter(models.SmartRenderingType.id == item_id).first()
        if not db_item:
            return False
        db.delete(db_item)
        db.commit()
        return True

    # --- Output Formats ---

    def get_output_formats(self, db: Session) -> List[models.SmartOutputFormat]:
        return db.query(models.SmartOutputFormat).all()

    def create_output_format(self, db: Session, item: schemas.SmartOutputFormatCreate) -> models.SmartOutputFormat:
        db_item = models.SmartOutputFormat(**item.dict())
        db.add(db_item)
        db.commit()
        db.refresh(db_item)
        return db_item

    def update_output_format(self, db: Session, item_id: str, item: schemas.SmartOutputFormatUpdate) -> Optional[models.SmartOutputFormat]:
        db_item = db.query(models.SmartOutputFormat).filter(models.SmartOutputFormat.id == item_id).first()
        if not db_item:
            return None
        for key, value in item.dict(exclude_unset=True).items():
            setattr(db_item, key, value)
        db.commit()
        db.refresh(db_item)
        return db_item

    def delete_output_format(self, db: Session, item_id: str) -> bool:
        db_item = db.query(models.SmartOutputFormat).filter(models.SmartOutputFormat.id == item_id).first()
        if not db_item:
            return False
        db.delete(db_item)
        db.commit()
        return True

smart_template_service = SmartTemplateService()
