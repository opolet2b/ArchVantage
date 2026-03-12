from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import List, Optional

from app.core.database import get_db
from app.schemas import smart_template as schemas
from app.services.smart_template_service import smart_template_service
from app.services.debug_service import debug_service

router = APIRouter(prefix="/smart-templates", tags=["smart-templates"])

# --- Global Categories ---

@router.get("/categories", response_model=List[schemas.SmartGlobalCategoryResponse])
def get_categories(context: Optional[str] = None, db: Session = Depends(get_db)):
    return smart_template_service.get_global_categories(db, context)

@router.post("/categories", response_model=schemas.SmartGlobalCategoryResponse)
def create_category(item: schemas.SmartGlobalCategoryCreate, db: Session = Depends(get_db)):
    result = smart_template_service.create_global_category(db, item)
    debug_service.log("INFO", "Smart Templates", "Category", f"Created category: {item.name}")
    return result

@router.put("/categories/{item_id}", response_model=schemas.SmartGlobalCategoryResponse)
def update_category(item_id: str, item: schemas.SmartGlobalCategoryUpdate, db: Session = Depends(get_db)):
    updated = smart_template_service.update_global_category(db, item_id, item)
    if not updated:
        raise HTTPException(status_code=404, detail="Category not found")
    return updated

@router.delete("/categories/{item_id}")
def delete_category(item_id: str, db: Session = Depends(get_db)):
    try:
        if not smart_template_service.delete_global_category(db, item_id):
            raise HTTPException(status_code=404, detail="Category not found")
        return {"status": "ok"}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

# --- Taxonomies ---

@router.get("/taxonomies", response_model=List[schemas.SmartTemplateTaxonomyResponse])
def get_taxonomies(db: Session = Depends(get_db)):
    return smart_template_service.get_taxonomies(db)

@router.post("/taxonomies", response_model=schemas.SmartTemplateTaxonomyResponse)
def create_taxonomy(item: schemas.SmartTemplateTaxonomyCreate, db: Session = Depends(get_db)):
    return smart_template_service.create_taxonomy(db, item)

@router.put("/taxonomies/{item_id}", response_model=schemas.SmartTemplateTaxonomyResponse)
def update_taxonomy(item_id: str, item: schemas.SmartTemplateTaxonomyUpdate, db: Session = Depends(get_db)):
    updated = smart_template_service.update_taxonomy(db, item_id, item)
    if not updated:
        raise HTTPException(status_code=404, detail="Item not found")
    return updated

@router.delete("/taxonomies/{item_id}")
def delete_taxonomy(item_id: str, db: Session = Depends(get_db)):
    if not smart_template_service.delete_taxonomy(db, item_id):
        raise HTTPException(status_code=404, detail="Item not found")
    return {"status": "ok"}

# --- Sections ---

@router.get("/sections", response_model=List[schemas.SmartTemplateDocumentSectionResponse])
def get_sections(db: Session = Depends(get_db)):
    return smart_template_service.get_sections(db)

@router.post("/sections", response_model=schemas.SmartTemplateDocumentSectionResponse)
def create_section(item: schemas.SmartTemplateDocumentSectionCreate, db: Session = Depends(get_db)):
    return smart_template_service.create_section(db, item)

@router.put("/sections/{item_id}", response_model=schemas.SmartTemplateDocumentSectionResponse)
def update_section(item_id: str, item: schemas.SmartTemplateDocumentSectionUpdate, db: Session = Depends(get_db)):
    updated = smart_template_service.update_section(db, item_id, item)
    if not updated:
        raise HTTPException(status_code=404, detail="Item not found")
    return updated

@router.delete("/sections/{item_id}")
def delete_section(item_id: str, db: Session = Depends(get_db)):
    if not smart_template_service.delete_section(db, item_id):
        raise HTTPException(status_code=404, detail="Item not found")
    return {"status": "ok"}

# --- Personas ---

@router.get("/personas", response_model=List[schemas.SmartTemplatePersonaResponse])
def get_personas(db: Session = Depends(get_db)):
    return smart_template_service.get_personas(db)

@router.post("/personas", response_model=schemas.SmartTemplatePersonaResponse)
def create_persona(item: schemas.SmartTemplatePersonaCreate, db: Session = Depends(get_db)):
    return smart_template_service.create_persona(db, item)

@router.put("/personas/{item_id}", response_model=schemas.SmartTemplatePersonaResponse)
def update_persona(item_id: str, item: schemas.SmartTemplatePersonaUpdate, db: Session = Depends(get_db)):
    updated = smart_template_service.update_persona(db, item_id, item)
    if not updated:
        raise HTTPException(status_code=404, detail="Item not found")
    return updated

@router.delete("/personas/{item_id}")
def delete_persona(item_id: str, db: Session = Depends(get_db)):
    if not smart_template_service.delete_persona(db, item_id):
        raise HTTPException(status_code=404, detail="Item not found")
    return {"status": "ok"}

# --- Frameworks ---

@router.get("/frameworks", response_model=List[schemas.SmartTemplateFrameworkResponse])
def get_frameworks(db: Session = Depends(get_db)):
    return smart_template_service.get_frameworks(db)

@router.post("/frameworks", response_model=schemas.SmartTemplateFrameworkResponse)
def create_framework(item: schemas.SmartTemplateFrameworkCreate, db: Session = Depends(get_db)):
    return smart_template_service.create_framework(db, item)

@router.put("/frameworks/{item_id}", response_model=schemas.SmartTemplateFrameworkResponse)
def update_framework(item_id: str, item: schemas.SmartTemplateFrameworkUpdate, db: Session = Depends(get_db)):
    updated = smart_template_service.update_framework(db, item_id, item)
    if not updated:
        raise HTTPException(status_code=404, detail="Item not found")
    return updated

@router.delete("/frameworks/{item_id}")
def delete_framework(item_id: str, db: Session = Depends(get_db)):
    if not smart_template_service.delete_framework(db, item_id):
        raise HTTPException(status_code=404, detail="Item not found")
    return {"status": "ok"}

# --- Thesauruses ---

@router.get("/thesauruses", response_model=List[schemas.SmartTemplateThesaurusResponse])
def get_thesauruses(db: Session = Depends(get_db)):
    return smart_template_service.get_thesauruses(db)

@router.post("/thesauruses", response_model=schemas.SmartTemplateThesaurusResponse)
def create_thesaurus(item: schemas.SmartTemplateThesaurusCreate, db: Session = Depends(get_db)):
    return smart_template_service.create_thesaurus(db, item)

@router.put("/thesauruses/{item_id}", response_model=schemas.SmartTemplateThesaurusResponse)
def update_thesaurus(item_id: str, item: schemas.SmartTemplateThesaurusUpdate, db: Session = Depends(get_db)):
    updated = smart_template_service.update_thesaurus(db, item_id, item)
    if not updated:
        raise HTTPException(status_code=404, detail="Item not found")
    return updated

@router.delete("/thesauruses/{item_id}")
def delete_thesaurus(item_id: str, db: Session = Depends(get_db)):
    if not smart_template_service.delete_thesaurus(db, item_id):
        raise HTTPException(status_code=404, detail="Item not found")
    return {"status": "ok"}

# --- Rendering Types ---

@router.get("/rendering-types", response_model=List[schemas.SmartRenderingTypeResponse])
def get_rendering_types(db: Session = Depends(get_db)):
    return smart_template_service.get_rendering_types(db)

@router.post("/rendering-types", response_model=schemas.SmartRenderingTypeResponse)
def create_rendering_type(item: schemas.SmartRenderingTypeCreate, db: Session = Depends(get_db)):
    return smart_template_service.create_rendering_type(db, item)

@router.put("/rendering-types/{item_id}", response_model=schemas.SmartRenderingTypeResponse)
def update_rendering_type(item_id: str, item: schemas.SmartRenderingTypeUpdate, db: Session = Depends(get_db)):
    updated = smart_template_service.update_rendering_type(db, item_id, item)
    if not updated:
        raise HTTPException(status_code=404, detail="Item not found")
    return updated

@router.delete("/rendering-types/{item_id}")
def delete_rendering_type(item_id: str, db: Session = Depends(get_db)):
    if not smart_template_service.delete_rendering_type(db, item_id):
        raise HTTPException(status_code=404, detail="Item not found")
    return {"status": "ok"}

# --- Output Formats ---

@router.get("/output-formats", response_model=List[schemas.SmartOutputFormatResponse])
def get_output_formats(db: Session = Depends(get_db)):
    return smart_template_service.get_output_formats(db)

@router.post("/output-formats", response_model=schemas.SmartOutputFormatResponse)
def create_output_format(item: schemas.SmartOutputFormatCreate, db: Session = Depends(get_db)):
    return smart_template_service.create_output_format(db, item)

@router.put("/output-formats/{item_id}", response_model=schemas.SmartOutputFormatResponse)
def update_output_format(item_id: str, item: schemas.SmartOutputFormatUpdate, db: Session = Depends(get_db)):
    updated = smart_template_service.update_output_format(db, item_id, item)
    if not updated:
        raise HTTPException(status_code=404, detail="Item not found")
    return updated

@router.delete("/output-formats/{item_id}") # Original path
def delete_output_format(item_id: str, db: Session = Depends(get_db)): # Original parameter name
    if not smart_template_service.delete_output_format(db, item_id): # Original service call
        raise HTTPException(status_code=404, detail="Item not found") # Original error message
    return {"status": "ok"} # Original success message

# --- AI Suggestions ---

class SuggestObjectiveRequest(BaseModel):
    preset_name: str
    source_sections: List[str]
    entities: str
    user_intent: str = "" # New field for user's brief description
    mode: str = "extractor" # "extractor" or "agent"

@router.post("/suggest-objective")
async def suggest_objective(request: SuggestObjectiveRequest):
    """
    Generates a prompt/objective based on context and user intent.
    Supports both Data Extraction and AI Agent Analysis modes.
    """
    from app.services.llm_service import llm_service
    from app.models.chat import Message
    import re
    
    # Construct the meta-prompt
    sections_text = ", ".join(request.source_sections) if request.source_sections else "Entire Document"
    entities_text = request.entities if request.entities else "None specified"
    intent_text = request.user_intent if request.user_intent else "No specific intent provided."
    
    system_prompt = (
        "You are an expert AI Prompt Engineer. Your goal is to write a precise, effective instruction (prompt) "
        "for another AI that will safely and accurately perform the requested task."
    )
    
    if request.mode == "extractor":
        user_prompt = (
            f"Context: The user wants to configure a Data Extraction AI.\n"
            f"Source Sections: {sections_text}\n"
            f"Entities of Interest: {entities_text}\n"
            f"User's Goal: {intent_text}\n\n"
            f"Task: Write a clear, step-by-step objective/prompt for the extraction AI.\n"
            f"The prompt should instruct the AI to:\n"
            f"1. Focus on the specified sections.\n"
            f"2. LOCATE and EXTRACT the requested entities.\n"
            f"3. Follow the user's specific goal: '{intent_text}'\n"
            f"4. Handle missing data appropriately.\n\n"
            f"Output ONLY the prompt text, no conversational filler."
        )
    elif request.mode == "extractor-focus":
        user_prompt = (
            f"Context: The user wants to define the Extraction Focus for an AI.\n"
            f"User's Goal: {intent_text}\n"
            f"Task: Write a concise list or description of the specific elements, topics, or data points the AI should focus on extracting.\n"
            f"Output ONLY the focus description."
        )
    elif request.mode == "extractor-exclude":
        user_prompt = (
            f"Context: The user wants to define Exclusion Patterns for an AI extraction task.\n"
            f"User's Intent: {intent_text}\n"
            f"Task: Write a clear list of patterns, sections, or types of content that should be strictly IGNORED during extraction (e.g., standard disclaimers, page headers, navigation menus).\n"
            f"Output ONLY the exclusion rules."
        )
    else: # Agent Mode
        user_prompt = (
            f"Context: The user wants to configure an AI Agent for analysis.\n"
            f"User's Goal: {intent_text}\n"
            f"Persona/Role: The agent will be acting as a specialized analyst.\n\n"
            f"Task: Write a detailed objective/prompt for this AI Agent.\n"
            f"The prompt should:\n"
            f"1. Clearly define the analytical goal based on: '{intent_text}'\n"
            f"2. Instruct the agent on what to look for and how to think.\n"
            f"3. Specify the desired outcome of the analysis.\n\n"
            f"Output ONLY the prompt text, no conversational filler."
        )
    
    messages = [
        Message(role="system", content=system_prompt),
        Message(role="user", content=user_prompt)
    ]
    
    try:
        response_content = await llm_service.chat(messages, model_name=request.preset_name)
        
        # Post-processing: Strip <think> tags
        cleaned_response = re.sub(r'<think>.*?</think>', '', response_content, flags=re.DOTALL).strip()
        
        return {"suggestion": cleaned_response}
    except Exception as e:
        print(f"Error generating suggestion: {e}")
        raise HTTPException(status_code=500, detail=str(e))

class SuggestRequest(BaseModel):
    preset_name: str
    type: str # taxonomy-description, persona-prompt, framework-spec, thesaurus-json, rendering-description
    details: dict # flexible payload

@router.post("/suggest")
async def suggest_admin_attribute(request: SuggestRequest):
    """
    Generic endpoint for AI suggestions in the Admin Panel.
    Supported types:
    - taxonomy-description: Suggests description for Analysis Taxonomy.
    - persona-prompt: Suggests system prompt for AI Persona.
    - framework-spec: Suggests AI specification for Analysis Framework.
    - thesaurus-json: Suggests JSON entries for Thesaurus.
    - rendering-description: Suggests description for Rendering Type.
    """
    from app.services.llm_service import llm_service
    from app.models.chat import Message
    import json
    
    details = request.details
    system_prompt = "You are an expert AI Assistant specializing in data analysis configuration."
    user_prompt = ""

    if request.type == "taxonomy-description":
        category = details.get("category", "")
        activity = details.get("activity", "")
        input_mode = details.get("input_mode", "")
        user_prompt = (
            f"Write a concise but professional description for an Analysis Activity.\n"
            f"Category: {category}\n"
            f"Activity Name: {activity}\n"
            f"Input Mode: {input_mode}\n"
            f"Task: Describe what this analysis does and its value proposition in one or two sentences."
        )

    elif request.type == "persona-prompt":
        role = details.get("role", "")
        tone = details.get("tone", "")
        user_prompt = (
            f"Write a System Prompt for an AI Persona.\n"
            f"Role: {role}\n"
            f"Tone: {tone}\n"
            f"Task: Write a comprehensive system prompt that instructs an LLM to adopt this persona. "
            f"Include instructions on communication style, expertise, and how to approach analysis tasks. "
            f"Keep it under 200 words."
        )

    elif request.type == "framework-spec":
        name = details.get("name", "")
        category = details.get("category", "")
        desc = details.get("description", "")
        url = details.get("url", "")
        user_prompt = (
            f"Write an AI Specification for an Analysis Framework.\n"
            f"Framework Name: {name}\n"
            f"Category: {category}\n"
            f"Description: {desc}\n"
            f"Documentation URL: {url}\n"
            f"Task: Write detailed instructions for an AI on how to apply this framework to analyze a document. "
            f"Specify the key sections or dimensions the AI should look for and how to structure the analysis."
        )

    elif request.type == "thesaurus-json":
        name = details.get("name", "")
        domain = details.get("domain", "")
        org = details.get("organization", "")
        user_prompt = (
            f"Generate a sample Terminology Database (Thesaurus) in JSON format.\n"
            f"Thesaurus Name: {name}\n"
            f"Industry Domain: {domain}\n"
            f"Source Organization: {org}\n"
            f"Task: Generate a comprehensive list of 10-15 key terms relevant to this domain and organization. "
            f"Format strictly as a JSON object where keys are the terms and values are their definitions.\n"
            f"Example: {{ \"Term\": \"Definition\" }}\n"
            f"Output ONLY the JSON object."
        )
        system_prompt += " You must output valid JSON only."

    elif request.type == "rendering-description":
        category = details.get("category", "")
        name = details.get("name", "")
        user_prompt = (
            f"Write a description for a Visual Rendering Type.\n"
            f"Category: {category}\n"
            f"Rendering Name: {name}\n"
            f"Task: Describe what this visualization looks like and when it should be used. Keep it concise."
        )

    elif request.type == "variable-description":
        name = details.get("name", "")
        var_type = details.get("var_type", "")
        user_prompt = (
            f"Write a description for an Analysis Variable.\n"
            f"Variable Name: {name}\n"
            f"Variable Type: {var_type}\n"
            f"Task: Write a clear and concise description of what this variable represents and how the AI should use it. "
            f"Explain its purpose in the context of data analysis."
        )

    else:
        raise HTTPException(status_code=400, detail="Invalid suggestion type")

    messages = [
        Message(role="system", content=system_prompt),
        Message(role="user", content=user_prompt)
    ]

    try:
        response_content = await llm_service.chat(messages, model_name=request.preset_name)
        
        # Post-processing
        import re
        cleaned_response = re.sub(r'<think>.*?</think>', '', response_content, flags=re.DOTALL).strip()
        
        # For JSON type, ensure we extract just the JSON
        if request.type == "thesaurus-json":
            # Simple heuristic to find JSON start/end if surrounded by markdown
            json_match = re.search(r'\{.*\}', cleaned_response, re.DOTALL)
            if json_match:
                cleaned_response = json_match.group(0)

        return {"suggestion": cleaned_response}
    except Exception as e:
        print(f"Error generating suggestion: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# --- Analysis Templates (Phase 2) ---

@router.get("/templates", response_model=List[schemas.SmartAnalysisTemplateResponse])
def get_templates(db: Session = Depends(get_db)):
    return smart_template_service.get_templates(db)

@router.get("/templates/{item_id}", response_model=schemas.SmartAnalysisTemplateResponse)
def get_template(item_id: str, db: Session = Depends(get_db)):
    template = smart_template_service.get_template_by_id(db, item_id)
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    return template

@router.post("/templates", response_model=schemas.SmartAnalysisTemplateResponse)
def create_template(item: schemas.SmartAnalysisTemplateCreate, db: Session = Depends(get_db)):
    return smart_template_service.create_template(db, item)

@router.put("/templates/{item_id}", response_model=schemas.SmartAnalysisTemplateResponse)
def update_template(item_id: str, item: schemas.SmartAnalysisTemplateUpdate, db: Session = Depends(get_db)):
    updated = smart_template_service.update_template(db, item_id, item)
    if not updated:
        raise HTTPException(status_code=404, detail="Item not found")
    return updated

@router.delete("/templates/{item_id}")
def delete_template(item_id: str, db: Session = Depends(get_db)):
    if not smart_template_service.delete_template(db, item_id):
        raise HTTPException(status_code=404, detail="Item not found")
    return {"status": "ok"}
