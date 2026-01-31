"""
Compiler Primitive

Merges a list of markdown sections into a final document.
"""
from typing import Any, Dict, List
from app.services.agent_primitives.base import BasePrimitive, PrimitiveResult

class CompilerPrimitive(BasePrimitive):
    """
    Compiler Primitive.
    
    Joins a list of section results into a single Markdown document.
    """
    
    @property
    def name(self) -> str:
        return "COMPILER"
    
    @property
    def description(self) -> str:
        return "Merges a list of sections into a final document."
    
    @property
    def param_schema(self) -> Dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "sections": {
                    "type": "string",
                    "description": "Variable containing the list of processed sections"
                },
                "plan_variable": {
                    "type": "string",
                    "description": "Variable containing the original plan (for titles)",
                    "default": None
                },
                "target_variable": {
                    "type": "string",
                    "description": "Variable to store the final markdown in",
                    "default": "compiled_document"
                },
                "add_toc": {
                    "type": "boolean",
                    "description": "Whether to generate a Table of Contents",
                    "default": False
                }
            },
            "required": ["sections", "target_variable"]
        }
    
    async def execute(self, params: Dict[str, Any], state: Dict[str, Any]) -> PrimitiveResult:
        """Merge sections."""
        sections_var = params.get("sections", "")
        plan_var = params.get("plan_variable")
        target_var = params.get("target_variable", "compiled_document")
        add_toc = params.get("add_toc", False)
        
        variables = state.get("variables", {})
        sections_data = self._get_nested_value(variables, sections_var)
        
        # Get plan data if variable provided
        plan_data = []
        if plan_var:
            plan_data = self._get_nested_value(variables, plan_var) or []
        
        if not isinstance(sections_data, list):
            # If it's a string, maybe it's a single key? try to resolve
            if isinstance(sections_data, str) and sections_data in variables:
                 sections_data = self._get_nested_value(variables, sections_data)
        
        if not isinstance(sections_data, list):
             # Fallback: maybe it IS the data? (Single string content)
             if isinstance(sections_data, str):
                 sections_data = [sections_data]
             else:
                 return PrimitiveResult(success=False, error=f"'{sections_var}' resolved to {type(sections_data)}, expected list")
        
        full_content = []
        
        print(f"[COMPILER] Compiling {len(sections_data)} items...")
        
        for idx, item in enumerate(sections_data):
            content = ""
            title_override = None
            
            # CASE A: Item is a String (Variable Key?)
            if isinstance(item, str):
                # Try to find it in variables
                if item in variables:
                    resolved_val = variables[item]
                    if isinstance(resolved_val, str):
                        content = resolved_val
                    elif isinstance(resolved_val, dict):
                         content = (
                            resolved_val.get("generated_markdown") or 
                            resolved_val.get("text") or 
                            resolved_val.get("content") or 
                            str(resolved_val)
                        )
                else:
                    # It's literal text? Or specific instruction output?
                    content = item
            
            # CASE B: Item is a Dict (Section Result)
            elif isinstance(item, dict):
                # Try standard keys
                content = (
                    item.get("generated_markdown") or 
                    item.get("text") or 
                    item.get("content") or 
                    item.get("filled_body") or
                    item.get("_raw")
                )

                # Try nested visualizer output
                if not content and "visualizer_output" in item:
                    try:
                        viz = item["visualizer_output"]
                        if isinstance(viz, dict) and "visual_payload" in viz:
                            content = viz["visual_payload"].get("content")
                            # If content is a dict/list (chart data), dump it to string
                            if isinstance(content, (dict, list)):
                                import json
                                content = json.dumps(content, indent=2)
                    except Exception as e:
                        print(f"[COMPILER] Error extracting visualizer content: {e}")

                if not content:
                    print(f"[COMPILER] DEBUG: Item {idx} keys: {list(item.keys())}")
                    # Last resort: Dump the whole dict if it's small? No, might be huge.
                    content = ""

            if content:
                # ENFORCE TITLE FROM PLAN
                # Use a try-except block for robust plan access
                try:
                    if plan_data and isinstance(plan_data, list) and idx < len(plan_data):
                        plan_item = plan_data[idx]
                        if isinstance(plan_item, dict):
                            title = plan_item.get("title", f"Section {idx+1}")
                            section_block = f"## {title}\n\n{content}"
                            full_content.append(section_block)
                        else:
                            full_content.append(content)
                    else:
                        full_content.append(content)
                except Exception as e:
                    print(f"[COMPILER] Error applying plan to section {idx}: {e}")
                    full_content.append(content) # Fallback
            else:
                 print(f"[COMPILER] Warning: Section {idx} has empty content")

        final_markdown = "\n\n".join(full_content)
        
        print(f"[COMPILER] Compilation complete. Length: {len(final_markdown)}")
        
        return PrimitiveResult(
            success=True,
            output={target_var: final_markdown}
        )
