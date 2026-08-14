from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
# DEV_RELOAD_TRIGGER: 2026-02-27 15:45
# Ensure NLTK resources are loaded before any other imports
import app.core.nltk_utils

# Import models and register with Base BEFORE any other imports that might use them
from app.models.user import User, Role, UserRole, KnownADGroup, GroupMapping
from app.models.canvas_models import Canvas, CanvasThing, CanvasLink, Domain, AnalysisSpace
from app.models.asset_models import Asset
from app.models.prompt_models import PromptRegistry, PromptOverride
from app.models.scenario_models import Scenario
from app.models.smart_template import (
    SmartAnalysisTemplate, SmartGlobalCategory, SmartTemplateTaxonomy,
    SmartTemplateDocumentSection, SmartTemplatePersona, SmartTemplateFramework,
    SmartTemplateThesaurus, SmartRenderingType, SmartOutputFormat
)
from app.models.agent_blueprint import AgentBlueprint, AgentNode, AgentEdge, AgentExecution
from app.models.template import Template, TemplateFolder, TemplatePermission
from app.models.tools import Tool, Category as ToolCategory, ToolPermission, MCPServer, MCPServerPermission
from app.models.knowledge_graph import KnowledgeBaseConfig
from app.models.stt import STTConfig
from app.models.workflow import WorkflowTemplate, WorkflowInstance, WorkflowExecutionLog

from app.routers import (
    chat, workflow, rag, knowledge, research, config, conversation,
    agents, auth, users, roles, oauth, tools, mcp_servers,
    agent_blueprints, agent_execution, templates, canvas, assets, prompts, debug,
    smart_template, maintenance, spaces, layout_router, scenarios, ai, ontology, stt, tts, ocr, wopi, gap_analysis, scenario_simulator, executive_summary
)
from app.services.debug_service import debug_service
from app.services.watcher_service import watcher_service
from app.core.database import engine, Base
from dotenv import load_dotenv

load_dotenv()

# Create database tables
Base.metadata.create_all(bind=engine)

app = FastAPI(title="ArchVantage")

@app.middleware("http")
async def log_requests(request, call_next):
    print(f"!!! INCOMING REQUEST: {request.method} {request.url.path}")
    response = await call_next(request)
    print(f"!!! RESPONSE STATUS: {response.status_code}")
    return response

@app.on_event("startup")
async def startup_event():
    watcher_service.start()
    # Initialize DB with default data
    from app.core.database import SessionLocal
    from app.core.init_db import init_db, run_migrations
    db = SessionLocal()
    try:
        # Run any pending schema migrations
        run_migrations(db)
        # Initialize default data
        init_db(db)
        
        # Sync Prompts to Registry
        from app.services.prompt_service import prompt_service
        from app.prompts import ALL_PROMPTS
        prompt_service.register_prompts(ALL_PROMPTS)
        debug_service.log("INFO", "System", "Startup", f"Application started. Registered {len(ALL_PROMPTS)} prompts.")
        
        # Initialize Knowledge Graph Schema (ArcadeDB) in background
        import asyncio
        from app.models.knowledge_graph import init_knowledge_graph_schema
        asyncio.create_task(asyncio.to_thread(init_knowledge_graph_schema))
        
        # Initialize RAG Service (Lazy loading, so no explicit init here)
        from app.services.rag_service import rag_service
        print("DEBUG: RAG Service registered (Lazy Loading)")
    finally:
        db.close()

from app.core.config import settings

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.BACKEND_CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
print(f"DEBUG: Allowed Origins: {settings.BACKEND_CORS_ORIGINS}")

import os

def is_enabled(feature_name: str) -> bool:
    return os.environ.get(feature_name, "true").lower() != "false"

# Core / Admin / System
app.include_router(auth.router, prefix="/api/v1", tags=["auth"])
app.include_router(users.router, prefix="/api/v1", tags=["users"])
app.include_router(roles.router, prefix="/api/v1", tags=["roles"])
app.include_router(chat.router, prefix="/api/v1", tags=["chat"])
app.include_router(config.router, prefix="/api/v1", tags=["config"])
app.include_router(conversation.router, prefix="/api/v1", tags=["conversation"])
app.include_router(oauth.router, prefix="/api/v1", tags=["oauth"])
app.include_router(canvas.router, prefix="/api/v1", tags=["canvas"])
app.include_router(assets.router, prefix="/api/v1/assets", tags=["assets"])
app.include_router(prompts.router, prefix="/api/v1", tags=["prompts"])
app.include_router(debug.router, prefix="/api/v1", tags=["debug"])
app.include_router(maintenance.router, prefix="/api/v1/maintenance", tags=["maintenance"])
app.include_router(spaces.router, prefix="/api/v1", tags=["spaces"])
app.include_router(layout_router.router, prefix="/api/v1", tags=["layout"])
app.include_router(scenarios.router, prefix="/api/v1", tags=["scenarios"])
app.include_router(ai.router, prefix="/api/v1", tags=["ai"])
app.include_router(gap_analysis.router, prefix="/api/v1", tags=["gap_analysis"])
app.include_router(scenario_simulator.router, prefix="/api/v1", tags=["scenario_simulator"])
app.include_router(executive_summary.router, prefix="/api/v1", tags=["executive_summary"])

# Optional Features
if is_enabled("ENABLE_WORKFLOWS"):
    app.include_router(workflow.router, prefix="/api/v1", tags=["workflow"])

if is_enabled("ENABLE_RAG"):
    app.include_router(rag.router, prefix="/api/v1", tags=["rag"])

if is_enabled("ENABLE_KNOWLEDGE_BASE"):
    app.include_router(knowledge.router, prefix="/api/v1", tags=["knowledge"])
    app.include_router(ontology.router, prefix="/api/v1", tags=["ontology"])
    
if is_enabled("ENABLE_RESEARCH"):
    app.include_router(research.router, prefix="/api/v1", tags=["research"])

if is_enabled("ENABLE_AGENTS"):
    app.include_router(agents.router, prefix="/api/v1", tags=["agents"])
    app.include_router(tools.router, prefix="/api/v1", tags=["tools"])
    app.include_router(mcp_servers.router, prefix="/api/v1", tags=["mcp-servers"])
    app.include_router(agent_blueprints.router, prefix="/api/v1", tags=["agent-blueprints"])
    app.include_router(agent_execution.router, prefix="/api/v1", tags=["agent-execution"])

if is_enabled("ENABLE_TEMPLATES"):
    app.include_router(templates.router, prefix="/api/v1", tags=["templates"])
    app.include_router(smart_template.router, prefix="/api/v1", tags=["smart-templates"])

if is_enabled("ENABLE_SPEECH"):
    app.include_router(stt.router, prefix="/api/v1/stt", tags=["stt"])
    app.include_router(tts.router, prefix="/api/v1/tts", tags=["tts"])

if is_enabled("ENABLE_OCR"):
    app.include_router(ocr.router, prefix="/api/v1/tools/ocr", tags=["ocr"])

if is_enabled("ENABLE_WOPI"):
    app.include_router(wopi.router, prefix="/api/v1", tags=["wopi"])

@app.get("/")
def read_root():
    return {"message": "Welcome to the ChatBot API"}

@app.get("/health")
def health_check():
    debug_service.log("DEBUG", "System", "Health", "Health check performed")
    return {"status": "ok"}
