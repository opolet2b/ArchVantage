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
            "archived": False,
            "messages": []
        }
        conversations[conv_id] = new_conv
        self._save_conversations(conversations)
        return new_conv

    def get_conversations(self, archived: bool = False) -> List[Dict[str, Any]]:
        conversations = self._get_all()
        # Filter by archived status
        # Handle backward compatibility where "archived" key might be missing (treat as False)
        filtered = [
            c for c in conversations.values() 
            if c.get("archived", False) == archived
        ]
        # Return list sorted by position (asc), then updated_at (desc)
        # Default position to 0 if missing
        return sorted(
            filtered, 
            key=lambda x: (x.get("position", 0), -datetime.fromisoformat(x["updated_at"]).timestamp())
        )

    def reorder_conversations(self, updates: List[Dict[str, Any]]) -> int:
        conversations = self._get_all()
        count = 0
        for update in updates:
            cid = update["id"]
            if cid in conversations:
                conversations[cid]["position"] = update["position"]
                # Don't update 'updated_at' to avoid jumping to top if we sorted by that alone
                count += 1
        
        if count > 0:
            self._save_conversations(conversations)
        return count

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
            return True
        return False

    def archive_conversation(self, conv_id: str) -> bool:
        conversations = self._get_all()
        if conv_id in conversations:
            conversations[conv_id]["archived"] = True
            conversations[conv_id]["updated_at"] = datetime.now().isoformat()
            self._save_conversations(conversations)
            return True
        return False

    def restore_conversation(self, conv_id: str) -> bool:
        conversations = self._get_all()
        if conv_id in conversations:
            conversations[conv_id]["archived"] = False
            conversations[conv_id]["updated_at"] = datetime.now().isoformat()
            self._save_conversations(conversations)
            return True
        return False

    def import_conversations(self, data_list: List[Dict[str, Any]]) -> int:
        """
        Import a list of conversations. 
        Generates new IDs to avoid collisions.
        Returns the number of successfully imported conversations.
        """
        conversations = self._get_all()
        count = 0
        
        for item in data_list:
            try:
                # Basic validation
                if "messages" not in item:
                    continue
                    
                new_id = str(uuid.uuid4())
                new_conv = {
                    "id": new_id,
                    "title": item.get("title", "Imported Conversation"),
                    "created_at": item.get("created_at", datetime.now().isoformat()),
                    "updated_at": datetime.now().isoformat(), # touched on import
                    "archived": False, # Import as active by default
                    "messages": item.get("messages", [])
                }
                conversations[new_id] = new_conv
                count += 1
            except Exception as e:
                print(f"Error importing item: {e}")
                continue
                
        if count > 0:
            self._save_conversations(conversations)
            
        return count

    def _resolve_active_model(self, conv_id: str, requested_model: str = "default") -> str:
        """
        If requested_model is "default", try to find if this conversation belongs 
        to a Canvas and use that canvas's selected LLM.
        """
        if requested_model and requested_model != "default":
            return requested_model
            
        try:
            from app.core.database import SessionLocal
            from app.models.canvas_models import CanvasThing, ThingType, Canvas
            
            db = SessionLocal()
            # 1. Find the Thing referencing this conversation
            thing = db.query(CanvasThing).filter(
                CanvasThing.type == ThingType.CONVERSATION
            ).all()
            
            target_canvas_id = None
            for t in thing:
                if t.content.get("conversation_id") == conv_id:
                    target_canvas_id = t.canvas_id
                    break
            
            if target_canvas_id:
                # 2. Get Canvas settings
                canvas = db.query(Canvas).filter(Canvas.id == target_canvas_id).first()
                if canvas and canvas.owner_config:
                    model = canvas.owner_config.get("selectedModel")
                    if model:
                        print(f"[ConversationService] Resolved 'default' -> '{model}' via Canvas {target_canvas_id}")
                        return model
            
            db.close()
        except Exception as e:
            print(f"[ConversationService] Error resolving canvas model: {e}")
            
        return requested_model

    async def add_message(self, conv_id: str, message: Dict[str, Any], model_name: str = "default") -> Optional[Dict[str, Any]]:
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
             # Resolve model properly
             active_model = self._resolve_active_model(conv_id, model_name)
             # Trigger async title generation
             await self.generate_title(conv_id, model_name=active_model)
             # Reload to get updated title
             return self._get_all()[conv_id]

        return conv

    async def generate_title(self, conv_id: str, model_name: str = "default"):
        conversations = self._get_all()
        if conv_id not in conversations:
            return

        messages = conversations[conv_id]["messages"]
        first_user_msg = next((m for m in messages if m["role"] == "user"), None)
        
        if not first_user_msg:
             return
             
        content_to_analyze = first_user_msg["content"]
        
        # Resolve model properly
        active_model = self._resolve_active_model(conv_id, model_name)
        
        # Use the specialized method
        title = await llm_service.generate_title(content_to_analyze, type="conversation", model_name=active_model)
        
        if title:
             self.update_conversation(conv_id, {"title": title})
             
             # Sync with CanvasThing if this conversation is on a canvas
             try:
                 from app.core.database import SessionLocal
                 from app.models.canvas_models import CanvasThing, ThingType
                 
                 db = SessionLocal()
                 # Find things referencing this conversation
                 # Using explicit link or content check
                 # Note: JSON filtering in generic SQLA is complex, doing hybrid search
                 things = db.query(CanvasThing).filter(
                     CanvasThing.type == ThingType.CONVERSATION
                 ).all()
                 
                 for thing in things:
                     if thing.content.get("conversation_id") == conv_id:
                         print(f"[ConversationService] Syncing title for Thing {thing.id} to '{title}'")
                         thing.title = title
                         db.add(thing)
                 
                 db.commit()
                 db.close()
             except Exception as e:
                 print(f"[ConversationService] Error syncing title to canvas: {e}")

conversation_service = ConversationService()
