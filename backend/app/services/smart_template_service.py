from sqlalchemy.orm import Session
from typing import List, Optional
from app.models import smart_template as models
from app.models.smart_template import SmartOutputFormat
from app.schemas import smart_template as schemas
from app.models.canvas_models import CanvasThing, Domain, ThingType, CanvasLink
from app.schemas import canvas_schemas
from app.services.agent_runtime import AgentRuntime
from app.services.rag_service import rag_service
from app.models.asset_models import Asset
from app.services.asset_service import asset_service
from llama_index.core import SimpleDirectoryReader
from typing import Dict, Any
import json
import os
from datetime import datetime
from app.schemas.smart_contracts import AssetRef, ExtractorInput, ExtractionInstructions

class SmartTemplateService:
    
    # --- Global Categories ---
    
    def get_global_categories(self, db: Session, context: Optional[str] = None) -> List[models.SmartGlobalCategory]:
        query = db.query(models.SmartGlobalCategory)
        if context:
            query = query.filter(models.SmartGlobalCategory.context == context)
        return query.all()

    def create_global_category(self, db: Session, item: schemas.SmartGlobalCategoryCreate) -> models.SmartGlobalCategory:
        # Check duplicate
        existing = db.query(models.SmartGlobalCategory).filter(
            models.SmartGlobalCategory.name == item.name,
            models.SmartGlobalCategory.context == item.context
        ).first()
        if existing:
            raise ValueError("A category with this name and context already exists.")

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
            
        # Check usage dependencies based on Context
        
        if db_item.context == "Taxonomy":
            if db.query(models.SmartTemplateTaxonomy).filter(models.SmartTemplateTaxonomy.category_name == db_item.name).first():
                raise ValueError(f"Cannot delete category '{db_item.name}' because it is used in Taxonomies.")
                
        elif db_item.context == "Document Sections":
            if db.query(models.SmartTemplateDocumentSection).filter(models.SmartTemplateDocumentSection.category_name == db_item.name).first():
                raise ValueError(f"Cannot delete category '{db_item.name}' because it is used in Document Sections.")
                
        elif db_item.context == "Frameworks":
            if db.query(models.SmartTemplateFramework).filter(models.SmartTemplateFramework.category_name == db_item.name).first():
                raise ValueError(f"Cannot delete category '{db_item.name}' because it is used in Frameworks.")
            
        db.delete(db_item)
        db.commit()
        return True

    # --- Taxonomies ---

    def get_taxonomies(self, db: Session) -> List[models.SmartTemplateTaxonomy]:
        return db.query(models.SmartTemplateTaxonomy).all()

    def create_taxonomy(self, db: Session, item: schemas.SmartTemplateTaxonomyCreate) -> models.SmartTemplateTaxonomy:
        # Check duplicate
        existing = db.query(models.SmartTemplateTaxonomy).filter(
            models.SmartTemplateTaxonomy.category_name == item.category_name,
            models.SmartTemplateTaxonomy.activity_type == item.activity_type
        ).first()
        if existing:
            raise ValueError("A taxonomy for this category and activity type already exists.")

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
        # Check duplicate
        existing = db.query(models.SmartTemplateDocumentSection).filter(
            models.SmartTemplateDocumentSection.name == item.name,
            models.SmartTemplateDocumentSection.category_name == item.category_name
        ).first()
        if existing:
            raise ValueError("A section with this name in this category already exists.")

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
        # Check duplicate
        existing = db.query(models.SmartTemplatePersona).filter(
            models.SmartTemplatePersona.role == item.role
        ).first()
        if existing:
            raise ValueError("A persona with this name already exists.")

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
        # Check duplicate
        existing = db.query(models.SmartTemplateFramework).filter(
            models.SmartTemplateFramework.name == item.name
        ).first()
        if existing:
            raise ValueError("A framework with this name already exists.")

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
        # Check duplicate
        existing = db.query(models.SmartTemplateThesaurus).filter(
            models.SmartTemplateThesaurus.name == item.name
        ).first()
        if existing:
            raise ValueError("A thesaurus entry with this name already exists.")

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

    async def _resolve_thing_content(self, db: Session, thing: CanvasThing, fragment: Optional[canvas_schemas.FragmentData] = None) -> str:
        """
        Resolve the actual text content of a thing for analysis.
        Priority:
        0. Fragment Content (if specific selection exists)
        1. RAG Search (Vectorized content) - Best for "Full Document" with semantic relevance
        2. Direct File Read (Fallback if RAG missing)
        3. Stored metadata/summaries
        """
        content_summary = ""
        content = thing.content or {}
        
        # 0. Fragment Priority
        if fragment:
            print(f"[ContentResolution] Using Fragment Data (Type: {fragment.type})")
            if fragment.type == "text" and fragment.content:
                return fragment.content
            elif fragment.type == "region":
                # For regions (images/PDFs), we return a metadata string describing the region
                # The visualizer/LLM often needs the image itself, but for text-based analysis, this prompts context.
                return f"[Selected Region at x={fragment.x:.2f}, y={fragment.y:.2f}, w={fragment.width:.2f}, h={fragment.height:.2f}]"
            elif fragment.type == "cell":
                return f"[Selected Cell: {fragment.range} in {fragment.sheet}] {fragment.content or ''}"
            elif fragment.content:
                return fragment.content
        
        print(f"\n[ContentResolution] Resolving content for Thing '{thing.title}' (ID: {thing.id}, Type: {thing.type.value})")
        
        # Strategy for Documents
        if thing.type.value == "document":
            file_path = content.get("file_path")
            
            # 0. Resolve Path from Asset ID (Always prioritize this as content file_path might be a URL)
            if content.get("asset_id"):
                try:
                    asset_id = content.get("asset_id")
                    # print(f"[ContentResolution] Resolving real path for Asset ID: {asset_id}")
                    asset = db.query(Asset).filter(Asset.id == asset_id).first()
                    if asset:
                        # Resolve absolute path using AssetService helper
                        resolved_path = asset_service.get_storage_path(asset)
                        if resolved_path:
                            file_path = str(resolved_path)
                            print(f"[ContentResolution] Resolved file path from Asset: {file_path}")
                        else:
                            print(f"[ContentResolution] Asset found but storage path resolution failed.")
                    else:
                        print(f"[ContentResolution] Asset ID {asset_id} not found in DB.")
                except Exception as e:
                    print(f"[ContentResolution] Asset path resolution error: {e}")

            # 1. Try RAG First (Vectorized Content)
            try:
                if file_path:
                    print(f"[ContentResolution] Attempting RAG Search. Filter source='{file_path}'")
                    # Use exact source filter to match ingestion metadata
                    rag_results = rag_service.search(
                        query="", 
                        k=100, 
                        filters={"source": file_path}
                    )
                    
                    if rag_results:
                        texts = [r["text"] for r in rag_results if r.get("text")]
                        if texts:
                            print(f"[ContentResolution] RAG Hit! Retrieved {len(texts)} chunks.")
                            print(f"[ContentResolution] Sample RAG content: {texts[0][:100]}...")
                            return "\n\n...[Vectorized Content Chunk]...\n\n".join(texts)
                        else:
                             print(f"[ContentResolution] RAG results contained no text fields.")
                    
                    print("[ContentResolution] RAG Index returned NO results for this file.")
                else:
                    print("[ContentResolution] Skipping RAG: No file_path available.")
                    
            except Exception as e:
                print(f"[ContentResolution] RAG search exception: {e}")

            # 2. Fallback: Direct File Read
            if file_path and os.path.exists(file_path):
                try:
                    print(f"[ContentResolution] Fallback: Reading file explicitly from disk: {file_path}")
                    documents = SimpleDirectoryReader(input_files=[file_path]).load_data()
                    if documents:
                        full_text = "\n\n".join([d.text for d in documents])
                        print(f"[ContentResolution] Direct Read Success. Length: {len(full_text)}")
                        return full_text
                    else:
                        print(f"[ContentResolution] Direct Read returned no documents.")
                except Exception as e:
                    print(f"[ContentResolution] Direct file read exception: {e}")
            else:
                 print(f"[ContentResolution] Skipping Direct Read: File path invalid or does not exist: {file_path}")

            # 3. Content field fallback
            if content.get("content") and isinstance(content.get("content"), str) and len(content.get("content")) > 100:
                 print(f"[ContentResolution] Using cached 'content' field ({len(content['content'])} chars)")
                 return content["content"]

        # Fallbacks (for non-documents or if above failed)
        print(f"[ContentResolution] All primary methods failed. Checking metadata fallbacks...")
        if content.get("generated_description"):
             print(f"[ContentResolution] Using 'generated_description' (VLM output).")
             content_summary = content["generated_description"]
        elif content.get("description"):
             print(f"[ContentResolution] Using 'description' field.")
             content_summary = content["description"]
        elif thing.type.value == "text":
             print(f"[ContentResolution] Using 'text' node content.")
             content_summary = content.get("text", "")[:4000] 
        else:
             print(f"[ContentResolution] Fallback to raw JSON dump.")
             content_summary = str(content)
             
        print(f"[ContentResolution] Final resolved content length: {len(content_summary)}")
        return content_summary

    async def execute_template(self, db: Session, request: canvas_schemas.ExecuteTemplateRequest) -> canvas_schemas.ExecuteTemplateResponse:
        # 1. Fetch Template
        template = self.get_template_by_id(db, request.template_id)
        if not template:
            raise ValueError(f"Template with ID {request.template_id} not found.")

        # 2. Collect Entities
        things = []
        if request.thing_ids:
            things = db.query(CanvasThing).filter(
                CanvasThing.id.in_(request.thing_ids),
                CanvasThing.canvas_id == request.canvas_id
            ).all()
        
        # 3. Construct Inputs
        entities_data = []
        entities_data = []
        for t in things:
             content_summary = await self._resolve_thing_content(db, t, request.source_fragment)

             entities_data.append({
                 "id": t.id,
                 "type": t.type.value,
                 "title": t.title,
                 "content": content_summary
             })
             
        # Create a single string context for templates that expect text
        combined_context = "\n\n".join([f"Item: {e['title']} ({e['type']})\n{e['content']}" for e in entities_data])
             
        inputs = {
            "selection": entities_data,
            "combined_context": combined_context,
            "canvas_id": request.canvas_id,
            "model": request.model
        }
        
        # 4. Execute
        # Construct a blueprint-like object for AgentRuntime
        blueprint_mock = {
            "graph": template.pipeline_config,
            "id": template.id
        }
        
        runtime = AgentRuntime(blueprint_mock, db)
        print(f"[SmartTemplate] Executing template '{template.name}' with {len(entities_data)} items.")
        
        try:
            result = await runtime.execute(inputs)
            
            status_msg = "completed" if result["status"] == "completed" else "failed"
            message = f"Execution completed successfully. (Model: {request.model})"
            if result["status"] == "failed":
                message = f"Execution failed: {result.get('error')} (Model: {request.model})"
                
            return canvas_schemas.ExecuteTemplateResponse(
                execution_id="temp_execution_id", # TODO: Persist execution
                status=status_msg,
                message=message
            )
        except Exception as e:
            print(f"[SmartTemplate] Execution error: {e}")
            return canvas_schemas.ExecuteTemplateResponse(
                execution_id="error",
                status="failed",
                message=str(e)
            )

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
        # Check duplicate
        existing = db.query(models.SmartRenderingType).filter(
            models.SmartRenderingType.category == item.category,
            models.SmartRenderingType.name == item.name
        ).first()
        if existing:
            raise ValueError("A rendering type with this name in this category already exists.")

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
        # Check duplicate
        existing = db.query(models.SmartOutputFormat).filter(
            models.SmartOutputFormat.type == item.type,
            models.SmartOutputFormat.name == item.name
        ).first()
        if existing:
            raise ValueError("An output format with this type and name already exists.")

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
    async def execute_template_stream(self, db: Session, request: canvas_schemas.ExecuteTemplateRequest):
        """
        Execute a template and yield progress events.
        """
        # 1. Fetch Template
        template = self.get_template_by_id(db, request.template_id)
        if not template:
            yield {"type": "error", "content": f"Template with ID {request.template_id} not found."}
            return

        # 2. Collect Entities
        # RELAXED LOOKUP: Query by ID first to ensure we find the thing even if canvas_id parameter is mismatched
        things = db.query(CanvasThing).filter(
            CanvasThing.id.in_(request.thing_ids)
        ).all()

        # Validation / Filtering
        valid_things = []
        for t in things:
             if str(t.canvas_id) != str(request.canvas_id):
                 print(f"[SmartTemplate] WARNING: Thing {t.id} belongs to canvas {t.canvas_id}, but request is for {request.canvas_id}. Allowing execution but this indicates a state mismatch.")
                 # We allow it to proceed because the User explicitly selected it.
             valid_things.append(t)
        things = valid_things

        # Log if we still missed something
        if request.thing_ids and not things:
             print(f"[SmartTemplate] CRITICAL: Requested thing_ids {request.thing_ids} NOT FOUND in DB (Global Search).")
            

        
        # 3. Construct Strictly Typed Inputs (Pydantic)
        assets = []
        entities_data = [] # Keep for legacy combined_context fallback
        
        for t in things:
             content_summary = await self._resolve_thing_content(db, t, request.source_fragment)
             
             # Create AssetRef
             asset_ref = AssetRef(
                 id=t.id,
                 type=t.type.value,
                 url=None, # TODO: Resolve URL if applicable
                 content=content_summary
             )
             assets.append(asset_ref)

             entities_data.append({
                 "id": t.id,
                 "type": t.type.value,
                 "title": t.title,
                 "content": content_summary
             })
             
        # Create legacy context just in case (for generic nodes)
        combined_context = "\n\n".join([f"Item: {e['title']} ({e['type']})\n{e['content']}" for e in entities_data])
        
        # Determine extraction instructions (try to find first Extractor step config)
        extraction_instructions = ExtractionInstructions(focus="Key information related to analysis goals")
        if template.pipeline_config:
            steps = template.pipeline_config.get("steps", [])
            for s in steps:
                s_type = s.get("type", "").lower()
                if "extractor" in s_type:
                    config = s.get("config", {})
                    try:
                        with open("app_debug.log", "a") as f:
                             f.write(f"\n[TEMPLATE DEBUG] Config Keys: {list(config.keys())}\n")
                             f.write(f"[TEMPLATE DEBUG] Additional Instr: {config.get('additionalInstructions')[:50] if config.get('additionalInstructions') else 'None'}\n")
                    except: pass

                    # Map config to instructions
                    focus = config.get("focus") or config.get("entitiesOfInterest") or "General content"
                    exclude = config.get("exclude")
                    additional_instr = config.get("additionalInstructions")
                    
                    mode = "default"
                    extraction_instructions = ExtractionInstructions(
                        focus=focus,
                        exclude=exclude,
                        additional_instructions=additional_instr,
                        mode=mode
                    )
                    
                    # Resolve Additional Assets (defined in Template Config)
                    source_ids = config.get("sourceSections", [])
                    print(f"[SmartTemplate] Fallback checking sourceSections: {source_ids}")
                    if source_ids:
                           # CanvasThing is already globally imported
                           # FIX: Ensure we ONLY pick up sourceSections if they belong to THIS canvas.
                           # This prevents the template from running on "Ghost" documents from other canvases.
                           extra_things = db.query(CanvasThing).filter(
                               CanvasThing.id.in_(source_ids),
                               CanvasThing.canvas_id == request.canvas_id 
                           ).all()
                           print(f"[SmartTemplate] Found {len(extra_things)} things in DB for sourceSections")
                           for t in extra_things:
                               if any(a.id == t.id for a in assets):
                                   print(f"[SmartTemplate] Skipping duplicate asset {t.id}")
                                   continue
                               content_summary = await self._resolve_thing_content(db, t)
                               print(f"[SmartTemplate] Resolved content for {t.id}: Len {len(str(content_summary))}")
                               if content_summary:
                                   assets.append(AssetRef(
                                      id=t.id,
                                      type=t.type.value,
                                      url=None,
                                      content=content_summary
                                   ))

                            
                    # Final Fallback: If still no assets, use ALL valid things on the canvas
                    if not assets:
                        print("[SmartTemplate] No selection and no sourceSections. Fallback: Loading ALL things from canvas.")
                        try:
                             all_things = db.query(CanvasThing).filter(
                                 CanvasThing.canvas_id == request.canvas_id, 
                                 CanvasThing.type.in_([ThingType.DOCUMENT, ThingType.TEXT, ThingType.URL])
                             ).limit(5).all()
                             
                             for t in all_things:
                                 content_summary = await self._resolve_thing_content(db, t)
                                 if content_summary:
                                     assets.append(AssetRef(
                                        id=t.id,
                                        type=t.type.value,
                                        url=None,
                                        content=content_summary
                                     ))
                             print(f"[SmartTemplate] Loaded {len(assets)} fallback assets from canvas.")
                        except Exception as e:
                            print(f"[SmartTemplate] Default Canvas Fallback failed: {e}")

                    break
             
        extractor_input = ExtractorInput(
            assets=assets,
            extraction_instructions=extraction_instructions
        )
             
        inputs = {
            "extractor_input": extractor_input.dict(), # STRICT INPUT
            "selection": entities_data,
            "combined_context": combined_context, # Fallback
            "canvas_id": request.canvas_id,
            "model": request.model
        }
        
        # Debug Logging to File
        try:
            with open("c:/Users/opole/.gemini/antigravity/brain/5682f1e1-88d7-441b-9713-8db9f498f08a/backend_debug.txt", "a") as f:
                f.write(f"\n[STREAM] {datetime.utcnow()} - Request Model: '{request.model}' (Type: {type(request.model)})\n")
                f.write(f"[STREAM] Inputs Model: '{inputs.get('model')}'\n")
        except Exception as e:
            print(f"Log Error: {e}")
            
        print(f"[SmartTemplate] Request Model: {request.model}")
        print(f"[SmartTemplate] Inputs Model: {inputs.get('model')}")
        
        # 4. Execute
        blueprint_mock = {
            "graph": template.pipeline_config,
            "id": template.id
        }
        
        runtime = AgentRuntime(blueprint_mock, db)
        print(f"[SmartTemplate] Streaming execution for '{template.name}' with {len(entities_data)} items.")
        
        try:
            async for event in runtime.execute_stream(inputs):
                yield event
                
                # Handle completion - Persist Result
                if event["type"] == "complete":
                    final_result = event.get("data", {})
                    outputs = final_result.get("outputs", {})
                    state_vars = final_result.get("execution_state", {})
                    full_state = final_result.get("full_state", {})
                    
                    # Fix: current_output is in full_state, not variables (execution_state)
                    current_output = full_state.get("current_output")
                    
                    print(f"[SmartTemplate] DEBUG: current_output type: {type(current_output)}")
                    if isinstance(current_output, dict):
                        print(f"[SmartTemplate] DEBUG: current_output keys: {list(current_output.keys())}")
                        if "generated_markdown" in current_output:
                            print(f"[SmartTemplate] DEBUG: generated_markdown length: {len(current_output['generated_markdown'])}")
                            print(f"[SmartTemplate] DEBUG: generated_markdown snippet: {str(current_output['generated_markdown'])[:50]}...")
                        if "_raw" in current_output:
                            print(f"[SmartTemplate] DEBUG: _raw length: {len(str(current_output['_raw']))}")
                    else:
                        print(f"[SmartTemplate] DEBUG: current_output value: {str(current_output)[:100]}")
                    
                    # Log Runtime Error if present
                    runtime_error = final_result.get("error") or full_state.get("error")
                    if runtime_error:
                         print(f"[SmartTemplate] CRITICAL RUNTIME ERROR: {runtime_error}")
                         # If there was an error, we can't expect output. 
                         # But we should still try to produce a fallback node if possible? Or just let it fail?
                         # The current logic will produce an empty node. 


                    # 1. Identify the *actual* final node (last executed step)
                    target_node_id = full_state.get("last_executed_node") or full_state.get("current_node")
                    
                    # Initialize result variables
                    thing_type = ThingType.TEXT
                    thing_content = {"text": "", "markdown": ""}
                    thing_title = f"Analysis: {template.name}"
                    
                    # Get Current Node info
                    # Prefer last_executed_node (set by runtime) as current_node might be None (end of flow)
                    current_node_id = full_state.get("last_executed_node") or full_state.get("current_node")
                    current_node_params = {}
                    
                    if current_node_id and template.pipeline_config:
                        # Find node in pipeline config
                        nodes = template.pipeline_config.get("nodes", {})
                        steps = template.pipeline_config.get("steps", []) # Check for linear steps format

                        # 1. Try "nodes" (Graph format)
                        if isinstance(nodes, list) and nodes: # Array format
                             for n in nodes:
                                 if n.get("id") == current_node_id:
                                     current_node_params = n.get("data", {}).get("params", {}) or n.get("params", {})
                                     break
                        elif isinstance(nodes, dict) and nodes: # Dict format
                             node_def = nodes.get(current_node_id, {})
                             current_node_params = node_def.get("data", {}).get("params", {}) or node_def.get("params", {})
                        
                        # 2. Try "steps" (Linear format) if no params found yet
                        if not current_node_params and isinstance(steps, list):
                            print(f"[SmartTemplate] Checking {len(steps)} steps for params...")
                            for s in steps:
                                if s.get("id") == current_node_id:
                                    current_node_params = s.get("params", {})
                                    print(f"[SmartTemplate] Found node in STEPS! Params keys: {current_node_params.keys()}")
                                    break
                        
                        if not current_node_params:
                             print(f"[SmartTemplate] WARNING: Params not found in nodes OR steps for ID: {current_node_id}")

                    print(f"[SmartTemplate] Final Node Params: {current_node_params.keys()}")

                    # Helper to resolve format from DB or string
                    def resolve_fmt_type(fmt_val):
                        if not fmt_val: return None, None
                        # Try DB lookup if it looks like a UUID (len 36)
                        if len(str(fmt_val)) == 36:
                             fmt_obj = db.query(models.SmartOutputFormat).filter(models.SmartOutputFormat.id == str(fmt_val)).first()
                             if fmt_obj:
                                 return fmt_obj.type.lower(), fmt_obj.extension.lower()
                        return "unknown", str(fmt_val).lower()

                    # 3. Parameter-Based Type Resolution
                    
                    # 3. Deterministic Category Resolution (Visualizer -> Formatter)
                    target_format_id = None
                    resolved_category = "text" # Default
                    
                    # A. Find the Visualizer Step to determine Category
                    visualizer_step = None
                    if isinstance(steps, list):
                        for s in steps:
                            if s.get("type") == "visualizer":
                                visualizer_step = s
                                # Keep searching to find the *last* one if multiple
                    
                    # B. If Visualizer found, get its Category from DB
                    if visualizer_step and visualizer_step.get("config", {}).get("renderingType"):
                        r_type_id = visualizer_step["config"]["renderingType"]
                        r_type_obj = db.query(models.SmartRenderingType).filter(models.SmartRenderingType.id == r_type_id).first()
                        if r_type_obj:
                            resolved_category = r_type_obj.category.lower()
                            print(f"[SmartTemplate] Found Visualizer Category: {resolved_category}")
                    
                    # ROBUST FIX: Explicitly find Formatter Step config
                    # The 'last_executed_node' might be misleading (e.g. pointing to Extractor).
                    # We know valid Output Config lives in the Formatter step.
                    formatter_params = {}
                    if isinstance(steps, list):
                        for s in steps:
                            if s.get("type") == "formatter":
                                formatter_params = s.get("params", {})
                                break
                    elif isinstance(nodes, list):
                         for n in nodes:
                             if n.get("type") == "formatter" or "formatter" in n.get("id", ""):
                                 formatter_params = n.get("data", {}).get("params", {}) or n.get("params", {})
                                 break

                    # Fallback to current_node_params if formatter not found (legacy or generic agent)
                    target_params = formatter_params or current_node_params

                    # C. Select the appropriate Format ID
                    # Priority: 1. Unified 'outputFormatId' 2. Legacy Category-based IDs
                    unified_fmt_id = target_params.get("outputFormatId") or target_params.get("output_format_id")
                    
                    # LOGGING START
                    with open("C:/Users/opole/Downloads/ChatBotn/backend/debug_trace.txt", "a") as trace:
                         trace.write(f"\n[TRACE] Target Params Keys: {list(target_params.keys())}\n")
                         trace.write(f"[TRACE] Unified ID: {unified_fmt_id}\n")
                         trace.write(f"[TRACE] Resolved Category (Visualizer): {resolved_category}\n")
                    # LOGGING END

                    if unified_fmt_id:
                         target_format_id = unified_fmt_id
                    elif "text" in resolved_category or "summary" in resolved_category:
                        target_format_id = target_params.get("text_format") or target_params.get("textFormatId")
                    elif "picture" in resolved_category or "image" in resolved_category or "diagram" in resolved_category:
                        target_format_id = target_params.get("graphic_format") or target_params.get("graphicsFormatId")
                    elif "table" in resolved_category or "data" in resolved_category:
                        target_format_id = target_params.get("data_format") or target_params.get("dataFormatId")
                    
                    # Override for Chart/Component Output (Rich Visualization)
                    if isinstance(current_output, dict) and "visualizer_output" in current_output:
                        vp = current_output["visualizer_output"].get("visual_payload", {})
                        st = vp.get("structure_type", "").lower()
                        # Detect rich visualization intent - simplified to trust the key
                        # If 'visualizer_output' exists, it is an Agent Result designed for ThingNode consumption
                        print(f"[SmartTemplate] Detected 'visualizer_output'. Overriding format to AGENT_RESULT.")
                        target_format_id = "CHART_OVERRIDE"

                    print(f"[SmartTemplate] Selected Format ID: {target_format_id} (Category: {resolved_category})")

                    # D. Resolve the Target Format
                    if target_format_id:
                        if target_format_id == "CHART_OVERRIDE":
                             thing_type = ThingType.AGENT_RESULT
                             # WRAPPER FIX: Frontend expects thing.content.visualizer_output
                             thing_content = {"visualizer_output": current_output["visualizer_output"]}
                             _p_type, fmt_ext = "visualizer", "json"
                             print(f"[SmartTemplate] Handling CHART_OVERRIDE. Assigned Content: {str(thing_content)[:100]}...")
                        else:
                            _p_type, fmt_ext = resolve_fmt_type(target_format_id)
                        
                        # LOGGING TYPE RESOLUTION
                        with open("C:/Users/opole/Downloads/ChatBotn/backend/debug_trace.txt", "a") as trace:
                             trace.write(f"[TRACE] Target ID: {target_format_id}\n")
                             trace.write(f"[TRACE] Resolved Type: {_p_type}, Ext: {fmt_ext}\n")
                        
                        # Graphic/Image
                        if "image" in str(fmt_ext) or "image" in str(_p_type) or "picture" in resolved_category:
                             thing_type = ThingType.IMAGE
                             thing_content["image_url"] = outputs.get("image_url", "")
                             
                             # Extract Image content
                             if isinstance(current_output, dict):
                                  raw = current_output
                                  thing_content = {
                                     "url": raw.get("image_url") or raw.get("url"),
                                     "alt_text": raw.get("alt_text") or "Generated Image"
                                  }
                             else:
                                  thing_content = {
                                     "url": str(current_output),
                                     "alt_text": "Generated Image"
                                  }

                        # Table/Data
                        # Prevent overwriting AGENT_RESULT (which uses json/visualizer types)
                        elif ("csv" in str(fmt_ext) or "json" in str(fmt_ext) or "table" in str(_p_type)) and thing_type != ThingType.AGENT_RESULT:
                             thing_type = ThingType.TABLE
                             
                             # DEBUG LOGGING
                             with open("smart_debug.log", "a", encoding="utf-8") as f:
                                 f.write(f"\n[SmartTemplate] Processing TABLE format. CurrentOutput Type: {type(current_output)}\n")
                                 if isinstance(current_output, dict):
                                     f.write(f"[SmartTemplate] Dict Keys: {list(current_output.keys())}\n")
                                 elif isinstance(current_output, str):
                                     f.write(f"[SmartTemplate] String Len: {len(current_output)}\n")

                             # Try to find table data
                             target_content = None
                             if isinstance(current_output, dict):
                                 if "visualizer_output" in current_output:
                                     with open("smart_debug.log", "a", encoding="utf-8") as f: f.write("[SmartTemplate] Found visualizer_output\n")
                                     payload = current_output["visualizer_output"].get("visual_payload", {})
                                     target_content = payload.get("content")
                                 elif "converted_document" in current_output:
                                      # New logic for DocumentConverter output
                                      with open("smart_debug.log", "a", encoding="utf-8") as f: f.write("[SmartTemplate] Found converted_document\n")
                                      target_content = current_output["converted_document"]
                                      with open("smart_debug.log", "a", encoding="utf-8") as f: f.write(f"[SmartTemplate] Content Preview: {str(target_content)[:200]}\n")
                                      
                             elif isinstance(current_output, list):
                                 with open("smart_debug.log", "a", encoding="utf-8") as f: f.write("[SmartTemplate] Output is List, using as data\n")
                                 target_content = current_output
                             
                             # Process found content
                             if target_content:
                                 # 1. Parse Data if not already a list
                                 parsed_data = []
                                 if isinstance(target_content, list):
                                     parsed_data = target_content
                                 else:
                                     val = str(target_content)
                                     thing_content["markdown"] = val
                                     thing_content["text"] = val
                                     
                                     # HTML Table Parsing
                                     if "<table" in val.lower() or "<thead>" in val.lower():
                                         try:
                                             import re
                                             # Simple regex to extract rows
                                             row_pattern = re.compile(r"<tr[^>]*>(.*?)</tr>", re.DOTALL | re.IGNORECASE)
                                             cell_pattern = re.compile(r"<(?:td|th)[^>]*>(.*?)</(?:td|th)>", re.DOTALL | re.IGNORECASE)
                                             
                                             rows = row_pattern.findall(val)
                                             with open("smart_debug.log", "a", encoding="utf-8") as f: f.write(f"[SmartTemplate] Regex found {len(rows)} rows\n")
                                             
                                             for r in rows:
                                                 cells = cell_pattern.findall(r)
                                                 # Clean cell text
                                                 clean_cells = []
                                                 for c in cells:
                                                     # Remove nested tags and bold markers
                                                     text = re.sub(r"<[^>]+>", "", c)
                                                     text = text.replace("&nbsp;", " ").replace("**", "").strip()
                                                     clean_cells.append(text)
                                                 if clean_cells:
                                                     parsed_data.append(clean_cells)
                                             
                                             with open("smart_debug.log", "a", encoding="utf-8") as f: 
                                                  f.write(f"[SmartTemplate] Parsed {len(parsed_data)} rows from HTML table\n")
                                         except Exception as e:
                                             with open("smart_debug.log", "a", encoding="utf-8") as f: f.write(f"[SmartTemplate] Error parsing HTML table: {e}\n")
                                             print(f"Error parsing HTML table: {e}")

                                     # CSV Fallback
                                     elif "csv" in str(fmt_ext) and not parsed_data:
                                          try:
                                               import csv
                                               from io import StringIO
                                               f = StringIO(val)
                                               reader = csv.reader(f)
                                               data = list(reader)
                                               if data: parsed_data = data
                                          except Exception as e:
                                               with open("smart_debug.log", "a", encoding="utf-8") as f: f.write(f"[SmartTemplate] Error parsing CSV: {e}\n")
                                 
                                 # 2. Assign Data
                                 if parsed_data:
                                     thing_content["data"] = parsed_data
                                     with open("smart_debug.log", "a", encoding="utf-8") as f: f.write(f"[SmartTemplate] Assigned {len(parsed_data)} rows to thing_content['data']\n")
                                 
                             
                             # Fallback: If we wanted a TABLE but got no data, check if we have text/markdown
                             if "data" not in thing_content and not thing_content.get("markdown"):
                                 with open("smart_debug.log", "a", encoding="utf-8") as f: f.write("[SmartTemplate] No data found yet. Checking fallbacks...\n")
                                 # We failed to get structured table data.
                                 # Check if we have standard text output (fallback from TextTemplate)
                                 # OR if we have Agent's formatted_output (SWOT table)
                                 raw_text = None
                                 if isinstance(current_output, dict):
                                      raw_text = (
                                          current_output.get("analysis_results", {}).get("formatted_output") or
                                          current_output.get("generated_markdown") or 
                                          current_output.get("_raw")
                                      )
                                 elif isinstance(current_output, str):
                                      # If it's a TABLE type and we have a string (likely CSV from DocumentConverter)
                                      with open("debug_csv.txt", "a") as log:
                                          log.write(f"\n[SmartTemplate DEBUG] Checking CSV Parse. ThingType: {thing_type}, Ext: {fmt_ext}, OutputType: {type(current_output)}\n")
                                      
                                      if thing_type == ThingType.TABLE and "csv" in str(fmt_ext):
                                          try:
                                              import csv
                                              from io import StringIO
                                              f = StringIO(current_output)
                                              reader = csv.reader(f)
                                              data = list(reader)
                                              with open("debug_csv.txt", "a") as log:
                                                  log.write(f"[SmartTemplate DEBUG] Parsed CSV Data Rows: {len(data)}\n")
                                              
                                              if data:
                                                  thing_content["data"] = data
                                                  raw_text = None # Do not trigger fallback
                                              else:
                                                  raw_text = current_output
                                          except Exception as e:
                                              with open("debug_csv.txt", "a") as log:
                                                  log.write(f"[SmartTemplate DEBUG] Failed to parse: {e}\n")
                                              raw_text = current_output
                                      else:
                                          with open("debug_csv.txt", "a") as log:
                                              log.write(f"[SmartTemplate DEBUG] Condition Failed. ThingType==TABLE? {thing_type == ThingType.TABLE}, 'csv' in ext? {'csv' in str(fmt_ext)}\n")
                                          raw_text = current_output
                                  
                                 if raw_text:
                                      print(f"[SmartTemplate] Table extraction failed, falling back to TEXT node with content (Len: {len(raw_text)}).")
                                      thing_type = ThingType.TEXT
                                      # The text extraction block below will handle populating logic
                                      # BUT we must ensure current_output is passed correctly or handled 
                                      # Actually, the block below 'if thing_type == ThingType.TEXT' re-reads current_output.
                                      # We just need to make sure it finds the formatted_output there too. (We fixed that in Step 1396)
                                  
                        # Text/Document (Default)
                        elif thing_type != ThingType.AGENT_RESULT:
                             f_path = outputs.get("file_path", "")
                             if ("pdf" in str(fmt_ext) or "document" in str(_p_type)) and f_path:
                                 thing_type = ThingType.DOCUMENT
                                 thing_content["file_path"] = f_path
                             else:
                                 # Fallback to TEXT if no file path provided, even for PDF format
                                 thing_type = ThingType.TEXT
                    else:
                        # Fallback if no format selected: Default to Text
                        thing_type = ThingType.TEXT
                        
                    # Extract Text/Markdown Content (Default or if explicit TEXT)
                    # Extract Text/Markdown Content (Default or if explicit TEXT)
                    if thing_type == ThingType.TEXT:
                         if isinstance(current_output, dict):
                            raw = current_output
                            # Check for specific 'formatted_output' (SWOT table etc) from Agent
                            # Or standard fields
                            val = (
                                raw.get("analysis_results", {}).get("formatted_output") or 
                                raw.get("generated_markdown") or 
                                raw.get("text") or 
                                raw.get("content") or
                                raw.get("filled_body") or
                                raw.get("_raw") or 
                                raw.get(current_node_params.get("output_variable") or "converted_document") or
                                str(raw)
                            )
                            # CRITICAL: Ensure we never pass a dict/list as 'text' to frontend logic
                            final_text = str(val) if isinstance(val, (dict, list)) else val
                            thing_content = {"text": final_text, "markdown": final_text}
                         else:
                            val = str(current_output or "")
                            thing_content = {"text": val, "markdown": val}

                    # If valid content to persist
                    if thing_content:

                        try:
                            # 1. Create Result Node
                            # Imports are global now
                            
                            # Determine Target Canvas ID
                            # CRITICAL FIX: Always co-locate result with the source nodes.
                            # If we rely solely on request.canvas_id, we might create the node on a "shadow" canvas
                            # if the Frontend URL state is desynchronized from the actual node location.
                            target_canvas_id = request.canvas_id
                            if things:
                                # Use the canvas_id of the first source node (assuming all sources are on same canvas for now)
                                # If cross-canvas sources are supported later, we might need a different strategy,
                                # but for now, co-location is key for links to work.
                                target_canvas_id = things[0].canvas_id
                                if str(target_canvas_id) != str(request.canvas_id):
                                     print(f"[SmartTemplate] CORRECTING CANVAS ID: Request={request.canvas_id}, SourceNode={target_canvas_id}. Forcing co-location.")

                            
                            # Calculate Centroid Position from Input Things
                            pos_x, pos_y = 400.0, 300.0 # Default fallback
                            if things:
                                count = len(things)
                                # Ensure we handle None values just in case
                                valid_things = [t for t in things if t.position_x is not None and t.position_y is not None]
                                if valid_things:
                                    count = len(valid_things)
                                    pos_x = sum([t.position_x for t in valid_things]) / count
                                    pos_y = sum([t.position_y for t in valid_things]) / count
                                    
                                    # Improved Positioning Strategy: "Next To" (Right Side)
                                    # Mimic Frontend logic: Place new node to the right of the source.
                                    # Find the right-most edge of the selection
                                    max_right = -float('inf')
                                    top_y = float('inf')
                                    
                                    for t in valid_things:
                                        t_x = t.position_x or 0
                                        t_y = t.position_y or 0
                                        t_w = t.width if t.width is not None else 400.0 # Default width
                                        
                                        right_edge = t_x + t_w
                                        if right_edge > max_right:
                                            max_right = right_edge
                                            # Align top with the right-most element (or average? Let's use average Y or top Y)
                                        
                                        if t_y < top_y:
                                            top_y = t_y
                                            
                                    # Set new position relative to the bounding box of selection
                                    pos_x = max_right + 50.0 
                                    pos_y = top_y # Align tops
                                    
                            new_node = CanvasThing(
                                canvas_id=target_canvas_id, # Use corrected ID
                                type=thing_type,
                                title=thing_title,
                                content=thing_content,
                                position_x=pos_x,
                                position_y=pos_y,
                                width=400.0,
                                height=400.0
                            )
                            db.add(new_node)
                            db.flush() # Get ID
                            
                            # 2. Link Inputs to Result
                            for t in things:
                                link = CanvasLink(
                                    canvas_id=target_canvas_id, # Use corrected ID (Links must belong to same canvas)
                                    source_id=t.id,
                                    target_id=new_node.id,
                                    type="related", # The user requested "Related" type
                                    label="analyzed_in"
                                )
                                db.add(link)
                            
                            db.commit()
                            db.refresh(new_node)
                            
                            print(f"[SmartTemplate] Created result node {new_node.id} on Canvas {target_canvas_id}")
                            
                            # 3. Notify Frontend
                            yield {
                                "type": "node_created",
                                "node": {
                                    "id": new_node.id,
                                    "title": new_node.title,
                                    "type": new_node.type.value,
                                    "content": new_node.content,
                                    "position_x": new_node.position_x,
                                    "position_y": new_node.position_y,
                                    # Frontend store might expect specific shape, but let's send model shape.
                                    # Actually, let's also send x/y for compatibility if frontend needs it,
                                    # but based on store it uses position_x/y
                                    "x": new_node.position_x,
                                    "y": new_node.position_y,
                                    "canvas_id": target_canvas_id # Send valid canvas ID back so frontend knows where it is
                                }
                            }
                        except Exception as persistence_error:
                            print(f"[SmartTemplate] Failed to persist result: {persistence_error}")
                            db.rollback()
                            yield {"type": "error", "content": f"Execution finished but failed to save result: {persistence_error}"}
                
        except Exception as e:
            print(f"[SmartTemplate] Execution error: {e}")
            yield {"type": "error", "content": str(e)}

    def delete_output_format(self, db: Session, item_id: str) -> bool:
        db_item = db.query(models.SmartOutputFormat).filter(models.SmartOutputFormat.id == item_id).first()
        if not db_item:
            return False
        db.delete(db_item)
        db.commit()
        return True

smart_template_service = SmartTemplateService()
