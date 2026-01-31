"""
Planner Primitive

Analyzes a document template and source content to create a structured list of research tasks.
"""
from typing import Any, Dict, List
import json
from app.services.agent_primitives.base import BasePrimitive, PrimitiveResult
from app.services.llm_service import llm_service
from app.models.chat import Message as ChatMessage

class PlannerPrimitive(BasePrimitive):
    """
    Planner Primitive.
    
    Generates a list of sections/tasks to specificy the research plan.
    """
    
    @property
    def name(self) -> str:
        return "PLANNER"
    
    @property
    def description(self) -> str:
        return "Analyzes requirements and creates a research plan (list of sections)."
    
    @property
    def param_schema(self) -> Dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "template": {
                    "type": "string",
                    "description": "The Document Template content or instructions"
                },
                "context": {
                    "type": "string",
                    "description": "Summary of available source documents"
                },
                "target_variable": {
                    "type": "string",
                    "description": "Variable to store the plan (list) in",
                    "default": "research_plan"
                }
            },
            "required": ["template", "target_variable"]
        }
    
    async def execute(self, params: Dict[str, Any], state: Dict[str, Any]) -> PrimitiveResult:
        """Execute the planning step."""
        template_content = params.get("template", "")
        context_summary = params.get("context", "")
        target_var = params.get("target_variable", "research_plan")
        
        # Resolve variables if needed
        template_content = self.resolve_variables(template_content, state)
        context_summary = self.resolve_variables(context_summary, state)
        
        # Robustly handle object inputs for context
        if isinstance(context_summary, dict):
             context_summary = (
                 context_summary.get("text") or 
                 context_summary.get("content") or 
                 context_summary.get("_raw") or 
                 str(context_summary)
             )
        
        system_prompt = """You are a Senior Research Planner.
Your goal is to break down a Document Template into a series of distinct, executable "Research Sections".

You will be given:
1. A Document Template (Blueprint) describing the structure of the final report.
2. A context summary of available source documents.

Your Output must be a JSON object containing a "sections" list.
Each item in "sections" must have:
- "id": A unique identifier (e.g., "sec_1")
- "title": Title of the section (MUST BE COPIED VERBATIM FROM TEMPLATE)
- "instruction": Specific instructions for WRITING this section (based on the template).
- "focus": Specific questions or topics to RESEARCH for this section (based on the template requirements).

CRITICAL INSTRUCTIONS:
- The "sections" list MUST be derived STRICTLY from the DOCUMENT TEMPLATE structure.
- Do NOT create sections based on the source document's chapters or structure.
- USE EXACT TITLES: The "title" field must match the Template's section headers character-for-character.
- GRANULARITY IS KEY: If the Template has sub-sections (e.g. 1.1, 1.2, 1.3), create a separate "section" item for EACH sub-section.
- Do NOT group multiple template requirements into one generic section. We need granular analysis.
- Your task is to map the Source Content *into* the Template's requirements.
- If the Template asks for "Risk Analysis", create a section for "Risk Analysis", even if the source document doesn't have a chapter named that.
- The "focus" field should be a research query to find relevant info for that specific template section within the source documents.
- The "instruction" field should be the writing instruction from the template.
- Ensure you cover EVERY section and sub-section of the template.
"""
        
        user_content = f"""
# DOCUMENT TEMPLATE
{template_content}

# CONTEXT / SOURCE DOCUMENTS
{context_summary}

# TASK
Generate the Research Plan JSON.
"""

        messages = [
            ChatMessage(role="system", content=system_prompt),
            ChatMessage(role="user", content=user_content)
        ]
        
        try:
            print(f"[PLANNER] Generating plan...")
            response_text = await llm_service.chat(
                messages=messages,
                model_name="gpt-4o", # Use smart model for planning
                response_format={"type": "json_object"}
            )
            
            plan_data = json.loads(response_text)
            sections = plan_data.get("sections", [])
            
            # --- DEDICATED TEMPLATE TRACE LOGGING ---
            try:
                with open("template_execution_trace.log", "a", encoding="utf-8") as f:
                    from datetime import datetime
                    f.write(f"\n{'='*60}\n")
                    f.write(f"[{datetime.now().isoformat()}] PLANNER STEP\n")
                    f.write(f"{'-'*60}\n")
                    f.write(f"SYSTEM PROMPT:\n{system_prompt}\n\n")
                    f.write(f"USER PROMPT (CONTEXT):\n{user_content}\n\n")
                    f.write(f"{'-'*60}\n")
                    f.write(f"GENERATED SECTIONS ({len(sections)}):\n")
                    for i, sec in enumerate(sections):
                        f.write(f"{i+1}. {sec.get('title')} (ID: {sec.get('id')})\n")
                        f.write(f"   Instruction: {sec.get('instruction')[:200]}...\n")
                    f.write(f"{'='*60}\n")
            except Exception as log_e:
                print(f"[PLANNER] Trace logging failed: {log_e}")
            # ----------------------------------------
            
            if not sections:
                return PrimitiveResult(success=False, error="Planner generated no sections.")
            
        except Exception as e:
            return PrimitiveResult(success=False, error=f"Planner failed: {e}")
