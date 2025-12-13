from pydantic import BaseModel
from typing import List, Optional
import uuid

class AgentConfig(BaseModel):
    id: str
    name: str
    expectations: str = ""
    constraints: str = ""
    system_prompt: str = ""
    knowledge_base: List[str] = []
    skills: List[str] = []

    @staticmethod
    def create_default(name: str):
        return AgentConfig(
            id=str(uuid.uuid4()),
            name=name
        )
