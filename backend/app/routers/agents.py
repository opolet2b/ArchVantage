from fastapi import APIRouter, HTTPException, UploadFile, File
from typing import List, Dict
import json
import os
import shutil
from app.models.agent_model import AgentConfig
from app.services.rag_service import rag_service
from app.services.debug_service import debug_service

router = APIRouter()

AGENTS_FILE = "data/agents.json"

def load_agents() -> Dict[str, AgentConfig]:
    if not os.path.exists(AGENTS_FILE):
        return {}
    try:
        with open(AGENTS_FILE, "r") as f:
            data = json.load(f)
            return {k: AgentConfig(**v) for k, v in data.items()}
    except Exception:
        return {}

def save_agents(agents: Dict[str, AgentConfig]):
    os.makedirs(os.path.dirname(AGENTS_FILE), exist_ok=True)
    with open(AGENTS_FILE, "w") as f:
        json.dump({k: v.model_dump() for k, v in agents.items()}, f, indent=2)

@router.get("/agents", response_model=List[AgentConfig])
async def list_agents():
    agents = load_agents()
    return list(agents.values())

@router.post("/agents", response_model=AgentConfig)
async def create_agent(agent: AgentConfig):
    agents = load_agents()
    if agent.id in agents:
        raise HTTPException(status_code=400, detail="Agent already exists")
    agents[agent.id] = agent
    save_agents(agents)
    debug_service.log("INFO", "Agents and Tools", "Agents", f"Created agent: {agent.name} ({agent.id})")
    return agent

@router.get("/agents/{agent_id}", response_model=AgentConfig)
async def get_agent(agent_id: str):
    agents = load_agents()
    if agent_id not in agents:
        raise HTTPException(status_code=404, detail="Agent not found")
    return agents[agent_id]

@router.put("/agents/{agent_id}", response_model=AgentConfig)
async def update_agent(agent_id: str, agent: AgentConfig):
    agents = load_agents()
    if agent_id not in agents:
        raise HTTPException(status_code=404, detail="Agent not found")
    if agent_id != agent.id:
        raise HTTPException(status_code=400, detail="Agent ID mismatch")
    
    agents[agent_id] = agent
    save_agents(agents)
    return agent

@router.delete("/agents/{agent_id}")
async def delete_agent(agent_id: str):
    agents = load_agents()
    if agent_id not in agents:
        raise HTTPException(status_code=404, detail="Agent not found")
    
    # Delete agent's files
    agent_dir = f"data/agents/{agent_id}"
    if os.path.exists(agent_dir):
        shutil.rmtree(agent_dir)
        
    # Delete agent's embeddings (assuming we can scope by agent_id in RAG service)
    # For now, we might need to update RAG service to handle agent-specific deletion if we use agent_id as conversation_id or similar
    # rag_service.delete_conversation_embeddings(agent_id) 

    del agents[agent_id]
    save_agents(agents)
    return {"status": "success"}

@router.post("/agents/generate-prompt")
async def generate_prompt(data: Dict[str, str]):
    expectations = data.get("expectations", "")
    constraints = data.get("constraints", "")
    
    # Mock implementation for now - in real app this would call LLM
    base_prompt = "You are an AI assistant designed to help with specific tasks.\n"
    if expectations:
        base_prompt += f"\nOBJECTIVES:\n{expectations}\n"
    if constraints:
        base_prompt += f"\nCONSTRAINTS:\n{constraints}\n"
        
    return {"system_prompt": base_prompt}

@router.post("/agents/{agent_id}/upload")
async def upload_agent_file(agent_id: str, file: UploadFile = File(...)):
    agents = load_agents()
    if agent_id not in agents:
        raise HTTPException(status_code=404, detail="Agent not found")
        
    try:
        upload_dir = f"data/agents/{agent_id}"
        os.makedirs(upload_dir, exist_ok=True)
        
        file_path = os.path.join(upload_dir, file.filename)
        
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
        # Ingest file - reusing RAG service but treating agent_id as conversation_id for isolation
        rag_service.ingest_file(file_path, agent_id)
        
        # Update agent config
        agent = agents[agent_id]
        if file.filename not in agent.knowledge_base:
            agent.knowledge_base.append(file.filename)
            save_agents(agents)
            
        return {
            "filename": file.filename,
            "status": "uploaded_and_ingested"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/agents/{agent_id}/files/{filename}")
async def delete_agent_file(agent_id: str, filename: str):
    agents = load_agents()
    if agent_id not in agents:
        raise HTTPException(status_code=404, detail="Agent not found")
        
    try:
        agent = agents[agent_id]
        if filename in agent.knowledge_base:
            agent.knowledge_base.remove(filename)
            save_agents(agents)
            
        # Delete file and embeddings
        rag_service.delete_document(agent_id, filename)
        
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/agents/{agent_id}/preview")
async def preview_agent(agent_id: str, request: Dict[str, str]):
    from fastapi.responses import StreamingResponse
    import asyncio
    import json
    
    query = request.get("query", "")
    
    async def event_generator():
        # 1. Input
        yield json.dumps({"type": "input", "content": query}) + "\n"
        await asyncio.sleep(1)
        
        # 2. Thought
        yield json.dumps({
            "type": "thought", 
            "content": "I need to analyze the user's request and check if I have the necessary tools or knowledge to answer it."
        }) + "\n"
        await asyncio.sleep(1.5)
        
        # 3. Action (Mock)
        yield json.dumps({
            "type": "action", 
            "content": "search_knowledge_base(query)"
        }) + "\n"
        await asyncio.sleep(1)
        
        # 4. Observation (Mock)
        yield json.dumps({
            "type": "observation", 
            "content": "Found relevant information in 'document.pdf'."
        }) + "\n"
        await asyncio.sleep(1)
        
        # 5. Response
        yield json.dumps({
            "type": "response", 
            "content": f"Based on the analysis, here is the answer to '{query}': [Mock Answer]"
        }) + "\n"

    return StreamingResponse(event_generator(), media_type="application/x-ndjson")
