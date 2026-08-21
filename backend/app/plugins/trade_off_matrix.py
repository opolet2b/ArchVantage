from typing import Optional
from sqlalchemy.orm import Session
from app.models.canvas_models import CanvasThing
from app.models.user import User
from app.schemas.canvas_schemas import AnalyzeRequest, AnalyzeResponse, AnalyzeAction
from app.plugins.registry import PluginRegistry

@PluginRegistry.register_analyzer("document")
async def extract_trade_off_matrix_options(
    request: AnalyzeRequest,
    thing: CanvasThing,
    db: Session,
    current_user: User
) -> Optional[AnalyzeResponse]:
    """
    Custom Map-Reduce extraction logic for Trade-off Matrix.
    Operates on Document things to extract alternatives.
    """
    is_extraction = request.action == AnalyzeAction.ASK and request.custom_prompt and "you are an expert enterprise architect" in request.custom_prompt.lower()
    
    if not is_extraction:
        # Not a trade-off matrix extraction, let the core logic handle it
        return None

    from app.services.rag_service import rag_service
    from app.services.llm_service import llm_service
    from app.models.chat import Message
    from app.routers.canvas import _resolve_active_model
    from app.models.canvas_models import Canvas
    import json
    import json
    from typing import TypedDict, List
    from langgraph.graph import StateGraph, END
    from app.services.rag_service import rag_service
    from app.services.llm_service import llm_service
    from app.models.chat import Message
    from app.routers.canvas import _resolve_active_model
    from app.models.canvas_models import Canvas
    
    canvas = db.query(Canvas).filter(Canvas.id == thing.canvas_id).first()
    active_model = _resolve_active_model(db, thing.canvas_id, None)
    
    search_filters = {}
    asset_id = thing.content.get("asset_id")
    if asset_id:
        search_filters["asset_id"] = asset_id

    import asyncio
    
    # 1. Run RAG Search asynchronously in a background thread to prevent blocking the FastAPI event loop
    print(f"[TradeOffMatrix Plugin] Extracting structured domains and alternatives via RAG...")
    
    import re
    methodology = "LLM Generated"
    if request.custom_prompt:
        match = re.search(r"METHODOLOGY:\s*(.*)", request.custom_prompt)
        if match:
            methodology = match.group(1).strip()
            
    methodology_instruction = "Generate the domains dynamically based on the document content."
    if methodology != "LLM Generated":
        methodology_instruction = f"Group the decisions into domains according to the {methodology} methodology."

    broad_prompt = f"""Analyze the document for architectural decisions or trade-offs. Return a strictly valid JSON array of Decision Domains. 
{methodology_instruction}
For each domain, list the competing mutually exclusive alternatives. 
For each alternative, extract its Pros, Cons, and the Recommended Fit (or any other appropriate criteria columns discussed).
Format exactly like this JSON structure (Do not use Markdown outside of the JSON):
[
  {{
    "domain": "Storage Infrastructure",
    "criteria_columns": ["Pros", "Cons", "Recommended Fit"],
    "alternatives": [
      {{
        "name": "Direct Attached Storage (DASD)",
        "description": "Simple initial deployment...",
        "evaluations": {{
          "Pros": "Simple initial deployment for isolated servers. No dedicated storage network required.",
          "Cons": "Low storage utilization efficiency. Complex backup operations.",
          "Recommended Fit": "Legacy / Edge Use Only"
        }}
      }}
    ]
  }}
]
"""
    
    try:
        results = await asyncio.to_thread(
            rag_service.search,
            query=broad_prompt, 
            k=20, 
            filters=search_filters, 
            model_name=active_model, 
            response_mode="compact"
        )
    except Exception as e:
        import traceback
        print(f"[TradeOffMatrix Plugin] RAG search failed: {e}")
        return AnalyzeResponse(
            thing_id=request.thing_id,
            action=request.action,
            result=json.dumps([{"domain": "RAG CRITICAL ERROR", "criteria_columns": ["Error"], "alternatives": [{"name": "Error", "description": str(traceback.format_exc()), "evaluations": {"Error": "Failed"}}]}]),
            created_thing_id=None
        )

    raw_text = "[]"
    if results and len(results) > 0 and results[0].get('metadata', {}).get('type') == 'synthesized_response':
        raw_text = results[0]['text']

    # 2. Parse Candidates
    print(f"[TradeOffMatrix Plugin] Parsing RAG results...")
    try:
        if '```json' in raw_text:
            json_str = raw_text.split('```json')[1].split('```')[0].strip()
        elif '```' in raw_text:
            json_str = raw_text.split('```')[1].split('```')[0].strip()
        else:
            import re
            match = re.search(r'\[[\s\S]*\]', raw_text)
            json_str = match.group(0) if match else "[]"
        
        domains = json.loads(json_str)
        if not isinstance(domains, list):
            domains = []
    except Exception as e:
        print(f"[TradeOffMatrix Plugin] Parser failed: {e}")
        domains = []

    print(f"[TradeOffMatrix Plugin] Extraction complete. Returning {len(domains)} domains.")
    
    # 3. Return Final Result
    return AnalyzeResponse(
        thing_id=request.thing_id,
        action=request.action,
        result=json.dumps(domains),
        created_thing_id=None
    )
