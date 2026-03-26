"""
Auditor Primitive

Reviews a document against a template and provides a structured critique/approval.
"""
from typing import Any, Dict, List
import json
from app.services.agent_primitives.base import BasePrimitive, PrimitiveResult
from app.services.llm_service import llm_service
from app.models.chat import Message as ChatMessage

class AuditorPrimitive(BasePrimitive):
    """
    Auditor Primitive.
    
    Critiques a document. Output contains 'status' (approved/rejected).
    """
    
    @property
    def name(self) -> str:
        return "AUDITOR"
    
    @property
    def description(self) -> str:
        return "Audits a document against requirements. Returns approval status."
    
    @property
    def param_schema(self) -> Dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "document": {
                    "type": "string",
                    "description": "The document to audit"
                },
                "template": {
                    "type": "string",
                    "description": "The original requirements/template"
                },
                "target_variable": {
                    "type": "string",
                    "description": "Variable to store the audit result",
                    "default": "audit_result"
                }
            },
            "required": ["document", "template", "target_variable"]
        }
    
    async def execute(self, params: Dict[str, Any], state: Dict[str, Any]) -> PrimitiveResult:
        doc_content = params.get("document", "")
        template_content = params.get("template", "")
        target_var = params.get("target_variable", "audit_result")
        
        doc_content = self.resolve_variables(doc_content, state)
        template_content = self.resolve_variables(template_content, state)
        
        system_prompt = """You are a Strict Quality Auditor.
Your job is to review a generated Report against its Original Blueprint/Template.

You must determine if the Report:
1. Covers all required sections.
2. Follows the instructions.
3. Is comprehensive and detailed.

Output JSON:
{
  "status": "approved" | "rejected",
  "critique": "Detailed explanation of what is missing or wrong...",
  "missing_sections": ["list", "of", "missing", "topics"]
}

Be strict. If the report is shallow or missing key info, REJECT it.
"""
        user_content = f"""
# ORIGINAL BLUEPRINT
{template_content}

# GENERATED REPORT
{doc_content}

# TASK
Audit this report.
"""
        messages = [
            ChatMessage(role="system", content=system_prompt),
            ChatMessage(role="user", content=user_content)
        ]
        
        try:
            print(f"[AUDITOR] Auditing document (Len: {len(doc_content)})...")
            # Use the service's chat with strip_think=False to capture reasoning
            import re
            response_raw = await llm_service.chat(
                messages=messages, 
                model_name="gpt-4o",
                response_format={"type": "json_object"},
                strip_think=False
            )
            
            # Extract thinking
            think_match = re.search(r"<think>(.*?)</think>", response_raw, flags=re.DOTALL | re.IGNORECASE)
            reasoning = None
            if think_match:
                reasoning = think_match.group(1).strip()
                response = re.sub(r"<think>.*?</think>", "", response_raw, flags=re.DOTALL | re.IGNORECASE).strip()
            else:
                response = response_raw
            
            result = json.loads(response)
            print(f"[AUDITOR] Result: {result.get('status')}")
            
            return PrimitiveResult(
                success=True,
                output={
                    target_var: result,
                    "reasoning": reasoning
                }
            )
        except Exception as e:
            return PrimitiveResult(success=False, error=f"Auditor failed: {e}")
