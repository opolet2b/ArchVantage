"""
Scenario Routers

API endpoints for managing and using scenarios.

PEP 8 Compliant
"""
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.core.database import get_db
from app.routers.auth import get_current_user, PermissionChecker
from app.models.user import User
from app.models.scenario_models import Scenario
from app.models.canvas_models import Canvas, Domain, ThingType, CanvasThing
from app.schemas.scenario_schemas import (
    ScenarioCreate, ScenarioUpdate, ScenarioResponse, 
    InstantiateScenarioRequest, ApplyScenarioRequest
)
from app.schemas.canvas_schemas import CanvasResponse
from app.services.debug_service import debug_service

router = APIRouter(prefix="/scenarios", tags=["scenarios"])

# =============================================================================
# CRUD Operations
# =============================================================================

@router.get("/", response_model=List[ScenarioResponse])
@router.get("", response_model=List[ScenarioResponse], include_in_schema=False)
def list_scenarios(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker("scenario:read"))
):
    """List all available scenarios."""
    scenarios = db.query(Scenario).offset(skip).limit(limit).all()
    return scenarios

@router.post("/", response_model=ScenarioResponse)
@router.post("", response_model=ScenarioResponse, include_in_schema=False)
def create_scenario(
    scenario: ScenarioCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker("scenario:write"))
):
    """Create a new scenario definition."""
    # Ensure users can't create system scenarios via API
    scenario_data = scenario.dict()
    scenario_data['is_system'] = False 
    
    # If this is set to default, unset others
    if scenario.is_default:
        db.query(Scenario).filter(Scenario.is_default == True).update({"is_default": False})

    db_scenario = Scenario(
        name=scenario.name,
        description=scenario.description,
        icon=scenario.icon,
        theme_color=scenario.theme_color,
        configuration=scenario.configuration,
        is_default=scenario.is_default,
        is_system=False,
        created_by_id=current_user.id
    )
    db.add(db_scenario)
    db.commit()
    db.refresh(db_scenario)
    debug_service.log("INFO", "Scenario", "CRUD", f"Created scenario: {db_scenario.name} ({db_scenario.id})")
    return db_scenario

@router.get("/{scenario_id}", response_model=ScenarioResponse)
def get_scenario(
    scenario_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker("scenario:read"))
):
    """Get a specific scenario by ID."""
    scenario = db.query(Scenario).filter(Scenario.id == scenario_id).first()
    if not scenario:
        raise HTTPException(status_code=404, detail="Scenario not found")
    return scenario

@router.patch("/{scenario_id}", response_model=ScenarioResponse)
def update_scenario(
    scenario_id: str,
    updates: ScenarioUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker("scenario:write"))
):
    """Update a scenario."""
    scenario = db.query(Scenario).filter(Scenario.id == scenario_id).first()
    if not scenario:
        raise HTTPException(status_code=404, detail="Scenario not found")
    
    # Protect System Scenarios
    if scenario.is_system:
        # Allow setting default, but nothing else if it is system
        # Actually, user provided requirement: "Vanilla Scenario ... cannot be modified"
        # But setting it as default might be allowed?
        # Let's say we allow ONLY 'is_default' update for system scenarios?
        # For now, strict: If system, NO editing of content. 
        # But we MUST allow 'is_default' toggle.
        
        allowed_keys = {'is_default'}
        update_keys = updates.dict(exclude_unset=True).keys()
        if any(k for k in update_keys if k not in allowed_keys):
             raise HTTPException(status_code=403, detail="System scenarios cannot be modified")

    update_data = updates.dict(exclude_unset=True)
    
    # Handle Default Switch
    if update_data.get("is_default") is True:
        db.query(Scenario).filter(Scenario.is_default == True).update({"is_default": False})
    
    for key, value in update_data.items():
        setattr(scenario, key, value)
    
    db.commit()
    db.refresh(scenario)
    return scenario

@router.delete("/{scenario_id}")
def delete_scenario(
    scenario_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker("scenario:write"))
):
    """Delete a scenario."""
    scenario = db.query(Scenario).filter(Scenario.id == scenario_id).first()
    if not scenario:
        raise HTTPException(status_code=404, detail="Scenario not found")
    
    if scenario.is_system:
        raise HTTPException(status_code=403, detail="System scenarios cannot be deleted")
    
    db.delete(scenario)
    db.commit()
    return {"message": "Scenario deleted"}

# =============================================================================
# Instantiation
# =============================================================================

@router.post("/{scenario_id}/instantiate", response_model=CanvasResponse)
def instantiate_scenario(
    request: InstantiateScenarioRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker("scenario:write"))
):
    """
    Create a new 'Master Canvas' based on a scenario.
    This copies the default domains, ghost nodes, and settings.
    """
    scenario = db.query(Scenario).filter(Scenario.id == request.scenario_id).first()
    if not scenario:
        raise HTTPException(status_code=404, detail="Scenario not found")
    
    config = scenario.configuration
    
    # 1. Create Canvas with Scenario Config
    new_canvas = Canvas(
        name=request.canvas_name or f"{scenario.name} Board",
        description=request.description or scenario.description,
        owner_id=current_user.id,
        owner_config={
            "scenario_id": scenario.id,
            "theme_color": scenario.theme_color,
            "automations": config.get("automations", []),
            "ui_overrides": config.get("ui_overrides", {}),
            "domain_definitions": config.get("domain_definitions", []),
            "domain_groups": config.get("domain_groups", []),
            "thing_metadata_schema": config.get("thing_metadata_schema", [])
        }
    )
    db.add(new_canvas)
    db.flush() # Get ID
    
    # 2. Instantiate Default Domains from Scenario Definitions
    domain_definitions = config.get("domain_definitions", [])
    print(f"[Scenario] Instantiating scenario {scenario.name} with {len(domain_definitions)} definitions")
    
    # Track index for staggering
    created_count = 0
    for definition in domain_definitions:
        # Check if we should create this domain by default
        # Use truthy check for safety
        is_default = definition.get("create_by_default") or str(definition.get("create_by_default")).lower() == 'true'
        print(f"  - Definition: {definition.get('name')} (ID: {definition.get('id')}), create_by_default: {is_default}")
        
        if is_default:
            def_id = definition.get("id")
            if not def_id:
                print("    ! Skipping: No ID found in definition")
                continue

            v_config = definition.get("visual_config") or {}
            
            # Use grid calculation to avoid stacking nodes on top of each other
            GRID_COLUMNS = 3
            X_START = 100
            Y_START = 100
            X_OFFSET = 900 # Width 800 + 100 gap
            Y_OFFSET = 1100 # Height 1000 + 100 gap
            
            col = created_count % GRID_COLUMNS
            row = created_count // GRID_COLUMNS
            
            pos_x = X_START + col * X_OFFSET
            pos_y = Y_START + row * Y_OFFSET
            
            print(f"    + Creating domain at ({pos_x}, {pos_y}) with {len(definition.get('drop_zones', []))} drop zones")
            
            new_domain = Domain(
                canvas_id=new_canvas.id,
                name=definition.get("name") or definition.get("label") or f"Domain {created_count + 1}",
                type=def_id,
                position_x=pos_x,
                position_y=pos_y,
                width=v_config.get("width", 800),
                height=v_config.get("height", 1000),
                color=v_config.get("color") or scenario.theme_color or "#3b82f6",
                visual_config=v_config,
                metadata_schema=definition.get("metadata_schema") or [],
                drop_zones=definition.get("drop_zones") or []
            )
            db.add(new_domain)
            created_count += 1
    
    # Legacy ghost nodes removed as per user preference for "no garbage"
        
    db.commit()
    db.refresh(new_canvas)
    debug_service.log("INFO", "Scenario", "Instantiation", f"Instantiated scenario {scenario.name} into canvas {new_canvas.id}")
    return new_canvas


@router.post("/apply-to-canvas/{canvas_id}", response_model=CanvasResponse)
def apply_to_canvas(
    canvas_id: str,
    request: ApplyScenarioRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker("scenario:write"))
):
    """
    Apply a scenario to an existing canvas.
    Updates overrides and provisions default domains.
    """
    scenario = db.query(Scenario).filter(Scenario.id == request.scenario_id).first()
    if not scenario:
        raise HTTPException(status_code=404, detail="Scenario not found")

    canvas = db.query(Canvas).filter(Canvas.id == canvas_id).first()
    if not canvas:
        raise HTTPException(status_code=404, detail="Canvas not found")

    config = scenario.configuration

    # Update Canvas Config
    # We use dict() to ensure SQLAlchemy detects the change (mutation tracking)
    new_config = dict(canvas.owner_config or {})
    new_config.update({
        "scenario_id": scenario.id,
        "theme_color": scenario.theme_color,
        "automations": config.get("automations", []),
        "ui_overrides": config.get("ui_overrides", {}),
        "domain_definitions": config.get("domain_definitions", []),
        "domain_groups": config.get("domain_groups", []),
        "thing_metadata_schema": config.get("thing_metadata_schema", [])
    })
    canvas.owner_config = new_config
    db.add(canvas)

    # Provision Default Domains
    # We look for definitions marked with 'create_by_default'
    domain_definitions = config.get("domain_definitions", [])
    print(f"[Scenario] Applying scenario {scenario.name} to canvas {canvas_id}. Found {len(domain_definitions)} definitions.")
    
    # Current existing domain types on this canvas to avoid exact duplicates
    existing_types = {d.type for d in db.query(Domain).filter(Domain.canvas_id == canvas_id).all()}
    print(f"  - Existing domain types on canvas: {existing_types}")
    
    # Track index for staggering
    created_count = 0
    for definition in domain_definitions:
        # Check if we should create this domain by default
        # Use truthy check for flexibility
        is_default = definition.get("create_by_default") or str(definition.get("create_by_default")).lower() == 'true'
        print(f"  - Definition: {definition.get('name')} (ID: {definition.get('id')}), create_by_default: {is_default}")

        if is_default:
            # Only create if no domain of this type exists
            def_id = definition.get("id")
            if not def_id:
                print("    ! Skipping: No ID found in definition")
                continue

            if def_id not in existing_types:
                # Safely get visual config
                v_config = definition.get("visual_config") or {}
                
                # Use grid calculation to avoid stacking nodes
                GRID_COLUMNS = 3
                X_START = 100
                Y_START = 100
                X_OFFSET = 900 # Width 800 + 100 gap
                Y_OFFSET = 1100 # Height 1000 + 100 gap
                
                col = created_count % GRID_COLUMNS
                row = created_count // GRID_COLUMNS
                
                pos_x = X_START + col * X_OFFSET
                pos_y = Y_START + row * Y_OFFSET
                
                print(f"    + Creating domain at ({pos_x}, {pos_y}) with {len(definition.get('drop_zones', []))} drop zones")
 
                new_domain = Domain(
                    canvas_id=canvas.id,
                    name=definition.get("name") or definition.get("label") or f"Domain {created_count + 1}",
                    type=def_id,
                    position_x=pos_x,
                    position_y=pos_y,
                    width=v_config.get("width", 800),
                    height=v_config.get("height", 1000),
                    color=v_config.get("color") or scenario.theme_color or "#3b82f6",
                    visual_config=v_config,
                    metadata_schema=definition.get("metadata_schema") or [],
                    drop_zones=definition.get("drop_zones") or []
                )
                db.add(new_domain)
                created_count += 1
            else:
                print(f"    - Type {def_id} already exists, skipping provisioning.")

    db.commit()
    db.refresh(canvas)
    return canvas


class GenerateWorkflowRequest(BaseModel):
    """Schema for AI workflow generation request."""
    prompt: str
    domains: List[Dict[str, Any]]
    model: Optional[str] = "default"


@router.post("/generate-workflow")
async def generate_workflow(
    request: GenerateWorkflowRequest,
    current_user: User = Depends(PermissionChecker("scenario:write"))
):
    """
    Generates a structured automation workflow using the selected LLM.
    Uses available domains to map natural language domain names to actual IDs.
    """
    try:
        # Prepare domains description for the prompt
        domains_list = []
        for d in request.domains:
            name = d.get("name")
            d_id = d.get("id")
            zones = [f"'{z.get('label')}' (ID: '{z.get('id')}')" for z in d.get("drop_zones", [])]
            zones_str = ", ".join(zones) if zones else "No defined zones"
            domains_list.append(
                f"- Name: '{name}', ID: '{d_id}' (Zones: {zones_str})"
            )
        domains_context = "\n".join(domains_list) if domains_list else "No domains available."

        system_prompt = (
            "You are an expert systems engineer specializing in automation workflows and pipelines.\n"
            "Your task is to take a natural language description of an automation and generate a structured "
            "JSON workflow consisting of sequential steps (primitives).\n\n"
            "Here are the available primitives and their exact expected input JSON properties:\n"
            "1. LLM_GENERATION\n"
            "   - Inputs: { \"prompt\": \"Detailed instructions for the AI explaining how to analyze the context\", \"context\": \"{{thing_content}}\", \"output_variable\": \"name\" }\n"
            "   - CRITICAL: Never write a short label or name like 'ValidateUseCase' or 'Analyze' for the prompt. Write a complete natural language instruction guiding the LLM.\n"
            "2. FOREACH\n"
            "   - Inputs: { \"items\": \"{{query_results.thing_ids}}\", \"iterator_var\": \"item_id\", \"steps\": [] } (steps contains child step objects)\n"
            "3. CANVAS_MOVE_TO_ZONE\n"
            "   - Inputs: { \"id\": \"{{thing_id}}\", \"domain_id\": \"uuid\", \"zone_id\": \"zone_uuid_or_name\" }\n"
            "4. LOGIC_IF_ELSE\n"
            "   - Inputs: { \"eval_type\": \"ai\"|\"strict\", \"condition\": \"prompt or operator\", \"context\": \"{{thing_content}}\", \"compare_value\": \"\", \"mode\": \"standard\"|\"iterative\", \"items\": \"\", \"iterator_var\": \"\", \"then_steps\": [], \"else_steps\": [] }\n"
            "   - CRITICAL FOR STRICT: When using 'eval_type': 'strict', do NOT write a comparison string (like '{{var}} == \"\"') under the condition key. Instead, separate them: set 'context' to the variable (e.g. '{{var}}'), 'condition' to the operator (e.g. 'is' or 'contains'), and 'compare_value' to the expected target value.\n"
            "5. CANVAS_QUERY\n"
            "   - Inputs: { \"target_canvas_id\": \"\", \"query\": \"{{thing_name}}\", \"limit\": 5 }\n"
            "6. CANVAS_QUERY_THINGS\n"
            "   - Inputs: { \"domain_id\": \"uuid\"|\"*\", \"thing_type\": \"all\"|\"text\"|\"document\", \"query\": \"\", \"criteria\": \"{}\", \"limit\": 10 }\n"
            "7. CANVAS_SET_PROPERTY\n"
            "   - Inputs: { \"id\": \"{{thing_id}}\", \"color\": \"#hex\", \"title\": \"optional new title\" }\n"
            "8. CANVAS_CREATE_LINK\n"
            "   - Inputs: { \"source_id\": \"{{thing_id}}\", \"target_id\": \"{{item_id}}\", \"type\": \"related\", \"label\": \"link label\", \"description\": \"mandatory reason\" }\n"
            "9. CANVAS_BATCH_LINK\n"
            "   - Inputs: { \"source_id\": \"{{thing_id}}\", \"target_ids\": \"{{query_results.thing_ids}}\", \"type\": \"related\", \"label\": \"label\", \"description\": \"mandatory reason\" }\n"
            "10. LOGIC_SET_VARIABLE\n"
            "    - Inputs: { \"variables\": { \"variable_name\": \"value\" } }\n\n"
            "CRITICAL DESIGN RULES:\n"
            "- YOU CANNOT expect a single LLM_GENERATION step to magically list, find, or know about items in a domain on the canvas. If you need to check, validate, match, or link items from a specific domain (e.g. finding matching Tenders), you MUST first run a CANVAS_QUERY_THINGS step to query and fetch those items into context (stored in {{query_results}}), and then process them (e.g. looping over them using FOREACH to validate each item individually).\n"
            "- When processing or validating items in a FOREACH loop (e.g. matching a use case to multiple tenders), do NOT loop over IDs '{{query_results.thing_ids}}' if you need to read the item's content. Instead, loop over the full objects list '{{query_results.things}}' (set 'items' to '{{query_results.things}}', and 'iterator_var' to 'tender'), and pass the current item object (e.g. '{{tender}}') into the 'context' or 'prompt' parameter of the validation step so the LLM gets the actual text content of the tender rather than just a UUID string.\n"
            "- The text content of the dropped item that triggers the workflow is ALWAYS in {{thing_content}} (never use {{item_content}} or {{item_content}} unless you explicitly defined it first). Its ID is ALWAYS in {{thing_id}}.\n"
            "- NEVER reference or read custom variables (like {{item_subject}}, {{tender_ids}}, {{valid_tenders}}) in prompts, condition checks, contexts, or loops UNLESS you have explicitly created and populated them in a preceding step (either via a 'LOGIC_SET_VARIABLE' step, or as the 'output_variable' of a preceding 'LLM_GENERATION' step).\n"
            "- ALWAYS map domain names mentioned in the prompt (e.g. Invoices, Contracts) to their corresponding domain ID from the list below.\n"
            "- Strive for complete accuracy in variable formatting: use {{thing_id}}, {{thing_content}}, {{thing_name}}, {{query_results.things}}, {{query_results.thing_ids}}, {{query_results.combined_content}}.\n"
            "- If a variable is going to be used as an accumulator (e.g. appending values inside a loop or branch), you MUST add a LOGIC_SET_VARIABLE step to initialize it with an empty string before entering the loop.\n"
            "- Always link items using CANVAS_CREATE_LINK or CANVAS_BATCH_LINK when the user requests connection, matching, or linking. The 'description' parameter in link primitives is MANDATORY.\n"
            "- If a conditional check is requested, use LOGIC_IF_ELSE. Nest the true branch steps in then_steps, and false branch steps in else_steps.\n\n"
            "Available Domains in this scenario:\n"
            f"{domains_context}\n\n"
            "You must return a JSON object with a single key 'steps', containing a list of step objects. "
            "Each step object MUST have 'id' (random 5-character string), 'primitive' (string name), and 'inputs' (object of parameters matching the structures above).\n"
            "Return ONLY the valid JSON object. Do not explain your reasoning or output any markdown other than the JSON object."
        )

        user_prompt = f"Create a workflow for this prompt: '{request.prompt}'"

        # Call the selected LLM configuration
        from app.services.llm_service import llm_service
        import json
        
        response_text = await llm_service.chat_completion(
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            model=request.model or "default",
            json_mode=True
        )

        # Extract and parse JSON response
        json_str = llm_service._extract_json(response_text)
        data = json.loads(json_str)
        
        # Ensure it has 'steps' key
        steps = data.get("steps", [])
        return {"steps": steps}

    except Exception as e:
        print(f"Error generating workflow: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to generate workflow: {str(e)}"
        )


class SuggestPromptRequest(BaseModel):
    """Schema for prompt suggestion request."""
    prompt: str
    domains: List[Dict[str, Any]]
    model: Optional[str] = "default"


@router.post("/suggest-prompt")
async def suggest_prompt(
    request: SuggestPromptRequest,
    current_user: User = Depends(PermissionChecker("scenario:write"))
):
    """
    Optimizes and refines a user's prompt for generating automations.
    """
    try:
        # Prepare domains description for the prompt
        domains_list = []
        for d in request.domains:
            name = d.get("name")
            d_id = d.get("id")
            zones = [f"'{z.get('label')}' (ID: '{z.get('id')}')" for z in d.get("drop_zones", [])]
            zones_str = ", ".join(zones) if zones else "No defined zones"
            domains_list.append(
                f"- Domain: '{name}' (ID: '{d_id}', Zones: {zones_str})"
            )
        domains_context = "\n".join(domains_list) if domains_list else "No domains available."

        system_prompt = (
            "You are an expert system automation prompt engineer.\n"
            "Your task is to refine, expand, and optimize a user's rough description of an automation "
            "so it can be used to generate a perfect visual workflow builder graph.\n\n"
            "Here is the context about the available domains in this scenario:\n"
            f"{domains_context}\n\n"
            "Guidelines for the optimized prompt:\n"
            "- Explicitly define the triggers, hooks, and conditions.\n"
            "- Clarify step-by-step logic, specifying which domain or dropzone target to move items to.\n"
            "- ALWAYS use the built-in trigger variable names: {{thing_content}} for the dropped document's content and {{thing_id}} for its ID. NEVER make up names like {{item_content}} or {{item_id}}.\n"
            "- If the user needs to check, match, or validate items against another domain (like Tenders), explicitly instruct to first query the items in that domain (using CANVAS_QUERY_THINGS) and then loop over them using FOREACH (on {{query_results.things}}), passing the current loop item (e.g. {{tender}}) to the LLM step context. Do NOT suggest listing items with a single LLM step without querying them first.\n"
            "- Make sure the description maps logically to standard system steps (move, LLM analyze, query, branch, link).\n"
            "Return ONLY the refined, clear, and optimized text prompt itself. Do not include any formatting, quotes, or prefaces like 'Here is the optimized prompt:'."
        )

        user_prompt = f"Optimize this rough automation prompt: '{request.prompt}'"

        # Call the selected LLM configuration
        from app.services.llm_service import llm_service
        
        response_text = await llm_service.chat_completion(
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            model=request.model or "default",
            temperature=0.7
        )

        clean_prompt = response_text.strip()
        if clean_prompt.startswith('"') and clean_prompt.endswith('"'):
            clean_prompt = clean_prompt[1:-1]
        if clean_prompt.startswith("'") and clean_prompt.endswith("'"):
            clean_prompt = clean_prompt[1:-1]

        return {"suggested_prompt": clean_prompt}

    except Exception as e:
        print(f"Error suggesting prompt: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to optimize prompt: {str(e)}"
        )
