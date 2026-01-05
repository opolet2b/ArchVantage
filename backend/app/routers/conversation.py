from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from app.services.conversation_service import conversation_service

router = APIRouter()

class Conversation(BaseModel):
    id: str
    title: str
    created_at: str
    updated_at: str
    archived: Optional[bool] = False
    messages: List[Dict[str, Any]]

class CreateConversationResponse(BaseModel):
    id: str
    title: str
    created_at: str
    updated_at: str
    messages: List[Dict[str, Any]]

class UpdateConversationRequest(BaseModel):
    title: Optional[str] = None

class AddMessageRequest(BaseModel):
    role: str
    content: str

@router.post("/conversations", response_model=CreateConversationResponse)
def create_conversation():
    return conversation_service.create_conversation()

@router.get("/conversations", response_model=List[Conversation])
def get_conversations(archived: bool = False):
    return conversation_service.get_conversations(archived=archived)

@router.get("/conversations/{conv_id}", response_model=Conversation)
def get_conversation(conv_id: str):
    conv = conversation_service.get_conversation(conv_id)
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return conv

@router.put("/conversations/{conv_id}", response_model=Conversation)
def update_conversation(conv_id: str, request: UpdateConversationRequest):
    updates = {k: v for k, v in request.dict().items() if v is not None}
    conv = conversation_service.update_conversation(conv_id, updates)
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return conv

@router.delete("/conversations/{conv_id}")
def delete_conversation(conv_id: str):
    success = conversation_service.delete_conversation(conv_id)
    if not success:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return {"status": "success"}

@router.patch("/conversations/{conv_id}/archive")
def archive_conversation(conv_id: str):
    success = conversation_service.archive_conversation(conv_id)
    if not success:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return {"status": "success"}

@router.patch("/conversations/{conv_id}/restore")
def restore_conversation(conv_id: str):
    success = conversation_service.restore_conversation(conv_id)
    if not success:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return {"status": "success"}

@router.post("/conversations/import")
def import_conversations(conversations: List[Dict[str, Any]]):
    count = conversation_service.import_conversations(conversations)
    return {"status": "success", "imported_count": count}

@router.post("/conversations/{conv_id}/messages", response_model=Conversation)
async def add_message(conv_id: str, request: AddMessageRequest):
    conv = await conversation_service.add_message(conv_id, request.dict())
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return conv
