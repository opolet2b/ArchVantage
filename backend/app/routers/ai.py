"""
AI Utilities Router

Endpoints for general AI tasks like prompt generation, text analysis, etc.
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
from app.services.llm_service import llm_service
from app.routers.auth import get_current_active_user
from app.models.user import User

router = APIRouter()

class GenerateSystemPromptRequest(BaseModel):
    model: str
    task_description: str

class GenerateSystemPromptResponse(BaseModel):
    system_prompt: str

@router.post("/ai/generate_system_prompt", response_model=GenerateSystemPromptResponse)
async def generate_system_prompt(
    request: GenerateSystemPromptRequest,
    current_user: User = Depends(get_current_active_user)
):
    """
    Generates a high-quality system prompt based on a rough task description.
    """
    try:
        # Construct the meta-prompt
        meta_prompt = f"""
        You are an expert Prompt Engineer. Your goal is to convert a rough user task description into a highly effective System Prompt for an AI agent.
        
        Refine the following task description into a clear, structured system prompt.
        The system prompt should include:
        - Role Definition (e.g., "You act as...")
        - Objective (What the AI should do)
        - Constraints (What to avoid)
        - Formatting Rules (Markdown, JSON, etc.)
        
        Task Description:
        {request.task_description}
        
        Return ONLY the raw system prompt text. Do not include introductory text like "Here is the prompt:".
        """
        
        response = await llm_service.chat_completion(
            system_prompt="You are a helpful AI assistant specializing in prompt engineering.",
            user_prompt=meta_prompt,
            model=request.model,
            temperature=0.7
        )
        
        # Clean up response if needed (e.g. remove quotes if LLM adds them unnecessarily)
        clean_prompt = response.strip()
        if clean_prompt.startswith('"') and clean_prompt.endswith('"'):
            clean_prompt = clean_prompt[1:-1]
            
        return GenerateSystemPromptResponse(system_prompt=clean_prompt)
        
    except Exception as e:
        print(f"Error generating system prompt: {e}")
        raise HTTPException(status_code=500, detail=str(e))
