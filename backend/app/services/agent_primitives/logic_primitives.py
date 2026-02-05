"""
Logic and Cross-Canvas Primitives

Primitives for conditional logic, cross-canvas querying, and linking.
"""
from typing import Any, Dict, List, Optional
from sqlalchemy.orm import Session
from app.services.agent_primitives.base import BasePrimitive, PrimitiveResult
from app.models.canvas_models import CanvasThing, CanvasLink, Canvas
from app.services.llm_service import llm_service

class LogicIfElsePrimitive(BasePrimitive):
    """
    Primitive for conditional branching (If/Then/Else).
    Evaluates a condition (using LLM or simple logic) and executes a branch of steps.
    """
    
    @property
    def name(self) -> str:
        return "LOGIC_IF_ELSE"
    
    @property
    def description(self) -> str:
        return "Evaluates a condition and executes one of two step sequences."
    
    @property
    def param_schema(self) -> Dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "condition": {
                    "type": "string",
                    "description": "Natural language condition or boolean expression (e.g. 'content contains error')"
                },
                "context": {
                    "type": "string",
                    "description": "Context to evaluate against (e.g. {{thing.content}})"
                },
                "then_steps": {
                    "type": "array",
                    "items": {"type": "object"},
                    "description": "Steps to execute if condition is True"
                },
                "else_steps": {
                    "type": "array",
                    "items": {"type": "object"},
                    "description": "Steps to execute if condition is False"
                }
            },
            "required": ["condition"]
        }
    
    async def execute(self, params: Dict[str, Any], state: Dict[str, Any]) -> PrimitiveResult:
        condition = params.get("condition", "")
        context = params.get("context", "")
        then_steps = params.get("then_steps", [])
        else_steps = params.get("else_steps", [])
        
        # Resolve context if it's a variable
        if context.startswith("{{") and context.endswith("}}"):
            context = self.resolve_variables(context, state)
            
        print(f"[LogicIfElse] Evaluating: '{condition}' on context len={len(context)}")
        
        # Evaluate Condition (Using LLM for flexibility)
        # We use a simple prompt to get a boolean-like 'YES' or 'NO'
        # Optimziation: If condition is trivial (e.g. check for substring in code), we could do it here.
        # But for "is valid" or "is compatible", we need LLM.
        
        # Simple heuristic: If condition contains "contains", do a simple check? 
        # No, Stick to LLM for robustness as per "AI Logic".
        
        prompt = f"""
        Evaluate the following condition based on the context provided.
        Respond with ONLY 'TRUE' or 'FALSE'.
        
        Condition: {condition}
        
        Context:
        {context[:1000]}... (truncated)
        """
        
        # Use simple model for speed
        decision = await llm_service.chat(
            messages=[{"role": "user", "content": prompt}],
            model_name="gpt-4o-mini", # Fallback to fast model if available, or default
            temperature=0.0
        )
        
        is_true = "TRUE" in decision.upper()
        print(f"[LogicIfElse] Result: {is_true}")
        
        steps_to_run = then_steps if is_true else else_steps
        
        if not steps_to_run:
            return PrimitiveResult(success=True, output={"branch": "true" if is_true else "false", "executed_steps": 0})
            
        # Execute Steps
        # We need to leverage GenericPipelinePrimitive to avoid code duplication
        # But we can't easily import it due to circular deps if it was in the same folder?
        # Actually it is in the same folder.
        from app.services.agent_primitives.pipeline_primitive import GenericPipelinePrimitive
        
        pipeline_runner = GenericPipelinePrimitive()
        
        # We reuse the same state
        result = await pipeline_runner.execute({"steps": steps_to_run}, state)
        
        if not result.success:
            return result
            
        return PrimitiveResult(
            success=True, 
            output={
                "branch": "true" if is_true else "false", 
                "pipeline_output": result.output
            }
        )

class CanvasQueryPrimitive(BasePrimitive):
    """
    Search for things in a target canvas.
    """
    
    @property
    def name(self) -> str:
        return "CANVAS_QUERY"
    
    @property
    def description(self) -> str:
        return "Search for Things in a specific canvas."
    
    @property
    def param_schema(self) -> Dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "target_canvas_id": {"type": "string"},
                "query": {"type": "string"},
                "limit": {"type": "integer"}
            },
            "required": ["target_canvas_id"]
        }
    
    async def execute(self, params: Dict[str, Any], state: Dict[str, Any]) -> PrimitiveResult:
        db: Session = state.get("db")
        target_id = params.get("target_canvas_id")
        query = params.get("query", "")
        limit = int(params.get("limit", 5))
        
        if not db:
            return PrimitiveResult(success=False, error="DB session missing")
            
        # Basic Text Search
        # In a real impl, we'd use Full Text Search or Vector Search if available
        things = db.query(CanvasThing).filter(
            CanvasThing.canvas_id == target_id,
            (CanvasThing.title.ilike(f"%{query}%")) | (CanvasThing.content.cast(str).ilike(f"%{query}%"))
        ).limit(limit).all()
        
        results_json = []
        for t in things:
            results_json.append({
                "id": t.id,
                "title": t.title,
                "type": t.type,
                "content_preview": str(t.content)[:100]
            })
            
        return PrimitiveResult(success=True, output={"query_results": results_json})

class CanvasCreateLinkPrimitive(BasePrimitive):
    """
    Create a semantic link between two items.
    """
    
    @property
    def name(self) -> str:
        return "CANVAS_CREATE_LINK"
    
    @property
    def description(self) -> str:
        return "Creates a link between two canvas items."
    
    @property
    def param_schema(self) -> Dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "source_id": {"type": "string"},
                "target_id": {"type": "string"},
                "label": {"type": "string"},
                "type": {"type": "string"}
            },
            "required": ["source_id", "target_id"]
        }
    
    async def execute(self, params: Dict[str, Any], state: Dict[str, Any]) -> PrimitiveResult:
        db: Session = state.get("db")
        if not db:
            return PrimitiveResult(success=False, error="DB session missing")
            
        source_id = params.get("source_id")
        target_id = params.get("target_id")
        
        # Resolve variables
        if source_id.startswith("{{"): source_id = self.resolve_variables(source_id, state)
        if target_id.startswith("{{"): target_id = self.resolve_variables(target_id, state)
        
        # Create Link
        new_link = CanvasLink(
            source_id=source_id,
            target_id=target_id,
            canvas_id=state.get("canvas_id"), # Assume link is created on CURRENT canvas
            label=params.get("label"),
            type=params.get("type", "related"),
            description=params.get("description")
        )
        
        db.add(new_link)
        db.commit()
        db.refresh(new_link)
        
        return PrimitiveResult(success=True, output={"created_link_id": new_link.id})
