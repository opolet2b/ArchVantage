from pydantic import BaseModel
from typing import List, Optional, Dict, Any


class Message(BaseModel):
    """Chat message model."""
    role: str
    content: str


class ChatRequest(BaseModel):
    """Standard chat request."""
    messages: List[Message]
    model: Optional[str] = "gpt-3.5-turbo"


class ChatResponse(BaseModel):
    """Standard chat response."""
    role: str
    content: str


class AgentMatchRequest(BaseModel):
    """Request to match a message against available agents."""
    message: str
    top_k: Optional[int] = 3
    min_confidence: Optional[float] = 0.5


class AgentMatchResult(BaseModel):
    """Single agent match result."""
    agent_id: str
    agent_name: str
    agent_description: str
    confidence: float
    reason: str
    inputs_schema: Dict[str, Any]


class AgentMatchResponse(BaseModel):
    """Response containing matched agents."""
    matches: List[AgentMatchResult]
    message: str


class AgentExecuteFromChatRequest(BaseModel):
    """Request to execute an agent from chat context."""
    agent_id: str
    inputs: Dict[str, Any]
    conversation_id: Optional[str] = None


class AgentExecuteFromChatResponse(BaseModel):
    """Response from agent execution in chat."""
    success: bool
    agent_id: str
    agent_name: str
    outputs: Dict[str, Any]
    error: Optional[str] = None
    execution_id: Optional[int] = None

