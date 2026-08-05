from pydantic import BaseModel
from typing import List, Optional, Dict, Any


class Message(BaseModel):
    """Chat message model."""
    role: str
    content: Any  # Can be str or List[Dict] for multi-modal


class ChatRequest(BaseModel):
    """Standard chat request."""
    messages: List[Message]
    model: Optional[str] = "gpt-3.5-turbo"
    conversation_id: Optional[str] = None
    kb_ids: List[str] = []
    enable_thinking: Optional[bool] = True


class CitationMatch(BaseModel):
    text: str
    score: float = 1.0
    page: Optional[Any] = None
    bbox: Optional[Any] = None
    row_id: Optional[Any] = None


class Citation(BaseModel):
    id: str
    title: str
    type: str
    matches: List[CitationMatch] = []


class ChatResponse(BaseModel):
    """Standard chat response."""
    role: str
    content: str
    citations: Optional[List[Citation]] = None


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
    """
    Response from agent execution in chat.
    
    When status is 'waiting_for_input', the frontend should render
    the gui_schema as a form and submit via /executions/{id}/input.
    """
    success: bool
    status: str = "completed"  # completed, failed, waiting_for_input
    agent_id: str
    agent_name: str
    outputs: Dict[str, Any]
    error: Optional[str] = None
    execution_id: Optional[int] = None
    # GUI form fields (present when status is 'waiting_for_input')
    gui_schema: Optional[Dict[str, Any]] = None
    tool_name: Optional[str] = None
    description: Optional[str] = None

