import json
import os
import uuid
from typing import Dict, Any, List, Optional
from datetime import datetime
from app.services.llm_service import llm_service

CONVERSATIONS_FILE = "data/conversations.json"

class ConversationService:
    def __init__(self):
        self.file_path = CONVERSATIONS_FILE
        self._ensure_file()

    def _ensure_file(self):
        if not os.path.exists("data"):
            os.makedirs("data")
        if not os.path.exists(self.file_path):
            self._save_conversations({})

    def _get_all(self) -> Dict[str, Any]:
        try:
            with open(self.file_path, "r") as f:
                return json.load(f)
        except Exception as e:
            print(f"Error reading conversations: {e}")
            return {}

    def _save_conversations(self, data: Dict[str, Any]):
        try:
            with open(self.file_path, "w") as f:
                json.dump(data, f, indent=4)
        except Exception as e:
            print(f"Error saving conversations: {e}")

    def create_conversation(self) -> Dict[str, Any]:
        conversations = self._get_all()
        conv_id = str(uuid.uuid4())
        new_conv = {
            "id": conv_id,
            "title": "New Conversation",
            "created_at": datetime.now().isoformat(),
            "updated_at": datetime.now().isoformat(),
            "messages": []
        }
        conversations[conv_id] = new_conv
        self._save_conversations(conversations)
        return new_conv

    def get_conversations(self) -> List[Dict[str, Any]]:
        conversations = self._get_all()
        # Return list sorted by updated_at desc
        return sorted(conversations.values(), key=lambda x: x["updated_at"], reverse=True)

    def get_conversation(self, conv_id: str) -> Optional[Dict[str, Any]]:
        conversations = self._get_all()
        return conversations.get(conv_id)

    def update_conversation(self, conv_id: str, updates: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        conversations = self._get_all()
        if conv_id not in conversations:
            return None
        
        conversations[conv_id].update(updates)
        conversations[conv_id]["updated_at"] = datetime.now().isoformat()
        self._save_conversations(conversations)
        return conversations[conv_id]

    def delete_conversation(self, conv_id: str) -> bool:
        conversations = self._get_all()
        if conv_id in conversations:
            del conversations[conv_id]
            self._save_conversations(conversations)
            
            # Cleanup embeddings
            try:
                from app.services.rag_service import rag_service
                rag_service.delete_conversation_embeddings(conv_id)
            except Exception as e:
                print(f"Error deleting embeddings for {conv_id}: {e}")
                
            # Cleanup uploaded files
            try:
                upload_dir = f"data/uploads/{conv_id}"
                if os.path.exists(upload_dir):
                    import shutil
                    shutil.rmtree(upload_dir)
            except Exception as e:
                print(f"Error deleting files for {conv_id}: {e}")
                
            return True
        return False

    async def add_message(self, conv_id: str, message: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        conversations = self._get_all()
        if conv_id not in conversations:
            return None

        conversations[conv_id]["messages"].append(message)
        conversations[conv_id]["updated_at"] = datetime.now().isoformat()
        self._save_conversations(conversations)
        
        # Auto-title if it's the first user message (total messages <= 2: system + user or just user)
        # Actually, let's do it if title is "New Conversation" and we have at least one user message
        conv = conversations[conv_id]
        if conv["title"] == "New Conversation" and len(conv["messages"]) >= 2:
             # Trigger async title generation (fire and forget or await?)
             # For simplicity, let's await it here or we can make a separate call
             await self.generate_title(conv_id)
             # Reload to get updated title
             return self._get_all()[conv_id]

        return conv

    async def generate_title(self, conv_id: str):
        conversations = self._get_all()
        if conv_id not in conversations:
            return

        messages = conversations[conv_id]["messages"]
        # Prepare a prompt for summarization
        # We need to convert dict messages to objects expected by LLMService if needed, 
        # but LLMService takes Pydantic models usually. Let's check LLMService usage.
        # LLMService.chat takes List[Message].
        
        from pydantic import BaseModel
        class Message(BaseModel):
            role: str
            content: str

        # Construct prompt messages
        prompt_messages = [
            Message(role="system", content="You are a helpful assistant. Generate a short, concise title (max 6 words) for this conversation based on the user's first message. Do not use quotes."),
            Message(role="user", content=f"Generate title for this conversation:\n\nUser: {messages[0]['content'] if messages else ''}")
        ]
        
        # If there are more messages, maybe include them? For now just the first user message is usually enough.
        # Let's find the first user message
        first_user_msg = next((m for m in messages if m["role"] == "user"), None)
        if not first_user_msg:
            return

        prompt_messages = [
            Message(role="system", content="Generate a short title (max 5 words) for this conversation. Output ONLY the title."),
            Message(role="user", content=first_user_msg["content"])
        ]

        try:
            title = await llm_service.chat(prompt_messages, model_name="default")
            title = title.strip().strip('"')
            self.update_conversation(conv_id, {"title": title})
        except Exception as e:
            print(f"Error generating title: {e}")

conversation_service = ConversationService()
