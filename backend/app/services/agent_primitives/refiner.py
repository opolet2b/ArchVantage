"""
Refiner Primitive

Rewrites a document based on an Auditor's critique.
"""
from typing import Any, Dict
from app.services.agent_primitives.base import BasePrimitive, PrimitiveResult
from app.services.llm_service import llm_service
from app.models.chat import Message as ChatMessage

class RefinerPrimitive(BasePrimitive):
    """
    Refiner Primitive.
    
    Improves a document based on critique.
    """
    
    @property
    def name(self) -> str:
        return "REFINER"
    
    @property
    def description(self) -> str:
        return "Refines a document based on critique."
    
    @property
    def param_schema(self) -> Dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "document": {
                    "type": "string",
                    "description": "Original draft"
                },
                "critique": {
                    "type": "string",
                    "description": "Critique from Auditor"
                },
                "context": {
                    "type": "string",
                    "description": "Original context/source data"
                },
                "target_variable": {
                    "type": "string",
                    "description": "Variable to store improved doc",
                    "default": "refined_document"
                }
            },
            "required": ["document", "critique", "target_variable"]
        }
    
    async def execute(self, params: Dict[str, Any], state: Dict[str, Any]) -> PrimitiveResult:
        doc = params.get("document", "")
        critique = params.get("critique", "")
        context = params.get("context", "")
        target_var = params.get("target_variable", "refined_document")
        
        doc = self.resolve_variables(doc, state)
        # Handle critique if it's an object/dict
        if isinstance(critique, dict):
            critique = str(critique)
        else:
            critique = self.resolve_variables(critique, state)
            
        context = self.resolve_variables(context, state)
        
        system_prompt = """You are a Senior Editor and Refiner.
You have a Draft Report and a Critique from an Auditor.
Your task is to REWRITE the report to address the critique.

Use the provided Source Context to fill in missing details if needed.
Ensure the final output is a Polished, Comprehensive Markdown document.
"""
        user_content = f"""
# CRITIQUE (FIX THESE ISSUES)
{critique}

# SOURCE CONTEXT
{context}

# DRAFT REPORT
{doc}

# TASK
Rewrite and Improve.
"""
        messages = [
            ChatMessage(role="system", content=system_prompt),
            ChatMessage(role="user", content=user_content)
        ]
        
        try:
            print(f"[REFINER] Refining document...")
            response = await llm_service.chat(messages=messages, model_name="gpt-4o")
            print(f"[REFINER] Refinement complete (Len: {len(response)})")
            
            return PrimitiveResult(
                success=True,
                output={target_var: response}
            )
        except Exception as e:
            return PrimitiveResult(success=False, error=f"Refiner failed: {e}")
