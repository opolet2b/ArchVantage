from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers import (
    chat, workflow, rag, search, research, config, conversation, 
    agents, auth, users, roles, oauth, tools, mcp_servers,
    agent_blueprints, agent_execution, templates, canvas, assets, prompts
)
from app.services.watcher_service import watcher_service
from app.core.database import engine, Base
from dotenv import load_dotenv

# Import models to register them with Base before create_all
from app.models import canvas_models, asset_models, prompt_models  # noqa: F401

load_dotenv()

# Create database tables
Base.metadata.create_all(bind=engine)

app = FastAPI(title="ChatBot Agent Orchestrator")

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
        print(f"DEBUG: Registered {len(ALL_PROMPTS)} prompts")
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

app.include_router(auth.router, prefix="/api/v1", tags=["auth"])
app.include_router(users.router, prefix="/api/v1", tags=["users"])
app.include_router(roles.router, prefix="/api/v1", tags=["roles"])
app.include_router(chat.router, prefix="/api/v1", tags=["chat"])
app.include_router(workflow.router, prefix="/api/v1", tags=["workflow"])
app.include_router(rag.router, prefix="/api/v1", tags=["rag"])
app.include_router(search.router, prefix="/api/v1", tags=["search"])
app.include_router(research.router, prefix="/api/v1", tags=["research"])
app.include_router(config.router, prefix="/api/v1", tags=["config"])
app.include_router(conversation.router, prefix="/api/v1", tags=["conversation"])
app.include_router(agents.router, prefix="/api/v1", tags=["agents"])
app.include_router(oauth.router, prefix="/api/v1", tags=["oauth"])
app.include_router(tools.router, prefix="/api/v1", tags=["tools"])
app.include_router(mcp_servers.router, prefix="/api/v1", tags=["mcp-servers"])
app.include_router(agent_blueprints.router, prefix="/api/v1", tags=["agent-blueprints"])
app.include_router(agent_execution.router, prefix="/api/v1", tags=["agent-execution"])
app.include_router(templates.router, prefix="/api/v1", tags=["templates"])
app.include_router(canvas.router, prefix="/api/v1", tags=["canvas"])
app.include_router(assets.router, prefix="/api/v1/assets", tags=["assets"])
app.include_router(prompts.router, prefix="/api/v1", tags=["prompts"])

@app.get("/")
def read_root():
    return {"message": "Welcome to the ChatBot API"}

@app.get("/health")
def health_check():
    return {"status": "ok"}
