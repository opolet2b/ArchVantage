"""
Document Template Service

Handles Document Template execution with deterministic processing.
Only instruction blocks trigger AI generation - everything else is direct output.

This service is separate from SmartTemplateService to avoid confusion between
Smart Analysis templates and Document Templates.
"""
import json
from typing import Dict, Any, List, Optional, Tuple
from datetime import datetime
from jinja2 import Environment, BaseLoader, exceptions as jinja_exceptions


class DocumentTemplateService:
    """
    Processes Document Templates deterministically.
    
    Block Types:
    - section: Output title as markdown header, process children
    - text: Output content with Jinja2 interpolation
    - instruction: Call AI to generate content (only AI-using block)
    - loop: Batch all items, process children with batch context
    - if/else: Evaluate JSON condition, process appropriate branch
    - frontmatter: Output content as-is
    """
    
    def __init__(self, llm_service=None):
        """
        Initialize the service.
        
        Args:
            llm_service: LLM service for instruction blocks.
                         If None, will be imported on demand.
        """
        self.llm_service = llm_service
        self.jinja_env = Environment(loader=BaseLoader())
        # Track else blocks that should be processed
        self._last_if_result = {}
    
    async def execute(
        self, 
        structure: Dict[str, Any], 
        context: Dict[str, Any],
        execution_config: Optional[Dict[str, Any]] = None,
        progress_callback: Optional[callable] = None
    ) -> Tuple[str, List[Dict[str, Any]]]:
        """
        Execute a document template with deterministic processing.
        
        Args:
            structure: The template structure JSON containing 'blocks' array
            context: Variables available for interpolation and conditions
            execution_config: Optional config with level_of_detail, etc.
            progress_callback: Optional async callback(section_title) called for each section
        
        Returns:
            Tuple of (final_document_string, execution_log)
        """
        blocks = structure.get("blocks", [])
        purpose = structure.get("purpose", "")
        
        # Add purpose to context for potential use
        context["_template_purpose"] = purpose
        
        # Parse execution config
        config = execution_config or structure.get("execution_config", {})
        level_of_detail = config.get("level_of_detail", "standard")
        context["_level_of_detail"] = level_of_detail
        
        # Store progress callback for use in handlers
        self._progress_callback = progress_callback
        
        execution_log = []
        output_parts = []
        
        for block in blocks:
            try:
                # Emit progress for top-level sections
                if progress_callback and block.get("type") == "section":
                    section_title = block.get("title", "Processing section...")
                    try:
                        await progress_callback(section_title)
                    except Exception as cb_err:
                        print(f"[DocTemplateService] Progress callback error: {cb_err}")
                
                result = await self._process_block(
                    block, context, depth=0, execution_log=execution_log
                )
                if result and result.strip():
                    output_parts.append(result)
            except Exception as e:
                error_msg = f"Error processing block {block.get('id', 'unknown')}: {e}"
                execution_log.append({
                    "type": "error",
                    "block_id": block.get("id"),
                    "error": str(e),
                    "timestamp": datetime.utcnow().isoformat()
                })
                print(f"[DocTemplateService] {error_msg}")
        
        # Clear callback reference
        self._progress_callback = None
        
        final_document = "\n\n".join(output_parts)
        
        return final_document, execution_log
    
    async def _process_block(
        self, 
        block: Dict[str, Any], 
        context: Dict[str, Any], 
        depth: int,
        execution_log: List[Dict[str, Any]]
    ) -> str:
        """
        Dispatch to appropriate handler based on block type.
        
        Args:
            block: The block to process
            context: Current variable context
            depth: Nesting depth (for header levels)
            execution_log: Log to append execution info
        
        Returns:
            Rendered string content for this block
        """
        block_type = block.get("type", "").lower()
        block_id = block.get("id", "unknown")
        
        handlers = {
            "section": self._handle_section,
            "text": self._handle_text,
            "instruction": self._handle_instruction,
            "loop": self._handle_loop,
            "if": self._handle_if,
            "else": self._handle_else,
            "frontmatter": self._handle_frontmatter,
        }
        
        handler = handlers.get(block_type, self._handle_unknown)
        
        execution_log.append({
            "type": "block_start",
            "block_id": block_id,
            "block_type": block_type,
            "depth": depth,
            "timestamp": datetime.utcnow().isoformat()
        })
        
        result = await handler(block, context, depth, execution_log)
        
        execution_log.append({
            "type": "block_end",
            "block_id": block_id,
            "output_length": len(result) if result else 0,
            "timestamp": datetime.utcnow().isoformat()
        })
        
        return result
    
    # -------------------------------------------------------------------------
    # Block Handlers
    # -------------------------------------------------------------------------
    
    async def _handle_section(
        self, 
        block: Dict[str, Any], 
        context: Dict[str, Any], 
        depth: int,
        execution_log: List[Dict[str, Any]]
    ) -> str:
        """
        Handle section block: output title as markdown header, process children.
        
        NO AI INVOLVED - purely deterministic.
        """
        title = block.get("title", "")
        children = block.get("children", [])
        
        # Interpolate variables in title
        title = self._interpolate(title, context)
        
        # Generate markdown header (## for depth 0, ### for depth 1, etc.)
        header_level = "#" * min(depth + 2, 6)
        output = f"{header_level} {title}\n"
        
        # Process children recursively
        child_outputs = []
        for child in children:
            child_result = await self._process_block(
                child, context, depth + 1, execution_log
            )
            if child_result and child_result.strip():
                child_outputs.append(child_result)
        
        if child_outputs:
            output += "\n".join(child_outputs)
        
        return output
    
    async def _handle_text(
        self, 
        block: Dict[str, Any], 
        context: Dict[str, Any], 
        depth: int,
        execution_log: List[Dict[str, Any]]
    ) -> str:
        """
        Handle text block: output content with Jinja2 interpolation.
        
        NO AI INVOLVED - purely deterministic.
        """
        content = block.get("content", "")
        return self._interpolate(content, context)
    
    async def _handle_instruction(
        self, 
        block: Dict[str, Any], 
        context: Dict[str, Any], 
        depth: int,
        execution_log: List[Dict[str, Any]]
    ) -> str:
        """
        Handle instruction block: THIS IS THE ONLY BLOCK THAT CALLS AI.
        
        The instruction content becomes the prompt for AI generation.
        """
        instruction = block.get("content", "")
        assign_to = block.get("assignTo") or block.get("assign_to")
        
        # Interpolate variables in instruction
        instruction = self._interpolate(instruction, context)
        
        if not instruction.strip():
            return ""
            
        if assign_to:
            # ASSIGN MODE: Extract JSON and store in context
            system_prompt = (
                "You are a precise data extraction assistant.\n"
                "Extract information from the provided context according to the instruction.\n"
                "Return ONLY valid JSON. If you are extracting a list of items, wrap it in a root object with the key 'items', e.g., {\"items\": [...]}.\n"
                "Do NOT include any markdown formatting, conversational text, or explanations outside the JSON."
            )
            user_prompt = self._build_instruction_user_prompt(instruction, context)
            
            execution_log.append({
                "type": "ai_extraction",
                "block_id": block.get("id"),
                "assign_to": assign_to,
                "timestamp": datetime.utcnow().isoformat()
            })
            
            result_str = await self._generate_with_ai(
                system_prompt, 
                user_prompt, 
                context,
                response_format={"type": "json_object"}
            )
            
            # Parse result and update context
            try:
                import json
                
                # Clean up potential Markdown Code Blocks
                clean_response = result_str.strip()
                if clean_response.startswith("```"):
                    clean_response = "\n".join(clean_response.split("\n")[1:])
                if clean_response.endswith("```"):
                    clean_response = clean_response[:-3].strip()
                    
                parsed_data = json.loads(clean_response)
                
                # Unwrap common root keys if the user requested a list
                if isinstance(parsed_data, dict) and assign_to in parsed_data:
                    context[assign_to] = parsed_data[assign_to]
                elif isinstance(parsed_data, dict) and "items" in parsed_data:
                    context[assign_to] = parsed_data["items"]
                else:
                    context[assign_to] = parsed_data
                    
            except Exception as e:
                print(f"[DocTemplateService] JSON Parsing error for assignment {assign_to}: {e}")
                # Fallback: store raw string and hope the template engine can handle it or just log it
                context[assign_to] = result_str
                
            # Nothing is output to the document at this block's position
            return ""
            
        else:
            # STANDARD MODE: Generate text for the document
            # Get level of detail for generation guidance
            level_of_detail = context.get("_level_of_detail", "standard")
            
            # Build system prompt
            system_prompt = self._build_instruction_system_prompt(level_of_detail)
            
            # Build user prompt with context
            user_prompt = self._build_instruction_user_prompt(instruction, context)
            
            execution_log.append({
                "type": "ai_call",
                "block_id": block.get("id"),
                "instruction_preview": instruction[:200],
                "level_of_detail": level_of_detail,
                "timestamp": datetime.utcnow().isoformat()
            })
            
            # Call AI
            result = await self._generate_with_ai(system_prompt, user_prompt, context)
            
            return result
    
    async def _handle_loop(
        self, 
        block: Dict[str, Any], 
        context: Dict[str, Any], 
        depth: int,
        execution_log: List[Dict[str, Any]]
    ) -> str:
        """
        Handle loop block: batch all items, process children with full context.
        
        SINGLE AI CALL with all items batched together.
        """
        loop_source = block.get("loopSource", "")
        children = block.get("children", [])
        
        # Get items from context (supporting nested keys)
        items = self._resolve_context_variable(loop_source, context) or []
        
        if not items:
            execution_log.append({
                "type": "loop_empty",
                "block_id": block.get("id"),
                "source": loop_source,
                "timestamp": datetime.utcnow().isoformat()
            })
            return ""
        
        execution_log.append({
            "type": "loop_start",
            "block_id": block.get("id"),
            "source": loop_source,
            "item_count": len(items),
            "timestamp": datetime.utcnow().isoformat()
        })
        
        # Process children for EACH item
        child_outputs = []
        for index, item in enumerate(items):
            local_context = {
                **context,
                "loop_item": item,
                "item": item,
                "loop_index": index,
                "loop_index1": index + 1,
                "loop_length": len(items),
                "loop_first": index == 0,
                "loop_last": index == len(items) - 1,
            }
            
            for child in children:
                child_result = await self._process_block(
                    child, local_context, depth, execution_log
                )
                if child_result and child_result.strip():
                    child_outputs.append(child_result)
        
        return "\n".join(child_outputs)
    
    async def _handle_if(
        self, 
        block: Dict[str, Any], 
        context: Dict[str, Any], 
        depth: int,
        execution_log: List[Dict[str, Any]]
    ) -> str:
        """
        Handle if block: evaluate condition, process children if true.
        
        Condition format (JSON for UI dropdowns):
        {
            "variable": "user_role",
            "operator": "equals",
            "value": "admin"
        }
        
        Or legacy string format for backward compatibility.
        """
        condition = block.get("content", "")
        children = block.get("children", [])
        block_id = block.get("id", "unknown")
        
        # Evaluate condition
        condition_result = self._evaluate_condition(condition, context)
        
        # Store result for associated else block
        self._last_if_result[block_id] = condition_result
        
        execution_log.append({
            "type": "condition_eval",
            "block_id": block_id,
            "condition": str(condition)[:100],
            "result": condition_result,
            "timestamp": datetime.utcnow().isoformat()
        })
        
        if not condition_result:
            return ""
        
        # Process children
        child_outputs = []
        for child in children:
            child_result = await self._process_block(
                child, context, depth, execution_log
            )
            if child_result and child_result.strip():
                child_outputs.append(child_result)
        
        return "\n".join(child_outputs)
    
    async def _handle_else(
        self, 
        block: Dict[str, Any], 
        context: Dict[str, Any], 
        depth: int,
        execution_log: List[Dict[str, Any]]
    ) -> str:
        """
        Handle else block: process children if previous if was false.
        
        Note: Else blocks should immediately follow their associated if block.
        """
        children = block.get("children", [])
        
        # Find the most recent if result
        # In practice, else should follow if in the blocks array
        # For now, check if any recent if was False
        should_process = any(
            result is False 
            for result in self._last_if_result.values()
        )
        
        if not should_process:
            return ""
        
        # Clear the if results after processing else
        self._last_if_result.clear()
        
        # Process children
        child_outputs = []
        for child in children:
            child_result = await self._process_block(
                child, context, depth, execution_log
            )
            if child_result and child_result.strip():
                child_outputs.append(child_result)
        
        return "\n".join(child_outputs)
    
    async def _handle_frontmatter(
        self, 
        block: Dict[str, Any], 
        context: Dict[str, Any], 
        depth: int,
        execution_log: List[Dict[str, Any]]
    ) -> str:
        """
        Handle frontmatter block: output content as-is.
        
        Frontmatter typically contains metadata or styling instructions.
        """
        content = block.get("content", "")
        # Interpolate in case there are variables
        return self._interpolate(content, context)
    
    async def _handle_unknown(
        self, 
        block: Dict[str, Any], 
        context: Dict[str, Any], 
        depth: int,
        execution_log: List[Dict[str, Any]]
    ) -> str:
        """Handle unknown block type - log warning and return empty."""
        block_type = block.get("type", "unknown")
        print(f"[DocTemplateService] Warning: Unknown block type '{block_type}'")
        return ""
    
    # -------------------------------------------------------------------------
    # Helper Methods
    # -------------------------------------------------------------------------
    
    def _interpolate(self, text: str, context: Dict[str, Any]) -> str:
        """
        Interpolate Jinja2 variables in text.
        
        Handles {{ variable }} and {{ variable | filter }} syntax.
        """
        if not text or "{{" not in text:
            return text
        
        try:
            template = self.jinja_env.from_string(text)
            return template.render(**context)
        except jinja_exceptions.UndefinedError as e:
            # Return original text if variable undefined
            print(f"[DocTemplateService] Interpolation warning: {e}")
            return text
        except Exception as e:
            print(f"[DocTemplateService] Interpolation error: {e}")
            return text
            
    def _resolve_context_variable(self, path: str, context: Dict[str, Any]) -> Any:
        """
        Resolve a potentially nested variable path (e.g. 'differences.items') in context.
        """
        if not path:
            return None
            
        if "." not in path:
            return context.get(path)
            
        parts = path.split(".")
        current = context
        for part in parts:
            if isinstance(current, dict):
                current = current.get(part)
            else:
                return None
        return current
    
    def _evaluate_condition(
        self, 
        condition: Any, 
        context: Dict[str, Any]
    ) -> bool:
        """
        Evaluate a condition against the context.
        
        Supports:
        1. JSON format (for UI dropdowns):
           {"variable": "x", "operator": "equals", "value": "y"}
        
        2. String format (legacy/Jinja2):
           "user_role == 'admin'"
        """
        if not condition:
            return True  # Empty condition = always true
        
        # Parse JSON condition if it's a dict or JSON string
        if isinstance(condition, str):
            try:
                condition = json.loads(condition)
            except json.JSONDecodeError:
                # It's a legacy string condition - evaluate with Jinja2
                return self._evaluate_string_condition(condition, context)
        
        if isinstance(condition, dict):
            return self._evaluate_json_condition(condition, context)
        
        # Fallback: truthy check
        return bool(condition)
    
    def _evaluate_json_condition(
        self, 
        condition: Dict[str, Any], 
        context: Dict[str, Any]
    ) -> bool:
        """
        Evaluate JSON-formatted condition.
        
        Format: {"variable": "x", "operator": "equals", "value": "y"}
        
        Operators:
        - equals, not_equals
        - contains, not_contains
        - greater_than, less_than, greater_or_equal, less_or_equal
        - is_empty, is_not_empty
        - is_true, is_false
        """
        variable = condition.get("variable", "")
        operator = condition.get("operator", "equals")
        value = condition.get("value")
        
        # Get variable value from context
        var_value = context.get(variable)
        
        # Operator dispatch
        operators = {
            "equals": lambda v, val: v == val,
            "not_equals": lambda v, val: v != val,
            "contains": lambda v, val: val in str(v) if v else False,
            "not_contains": lambda v, val: val not in str(v) if v else True,
            "greater_than": lambda v, val: float(v) > float(val) if v else False,
            "less_than": lambda v, val: float(v) < float(val) if v else False,
            "greater_or_equal": lambda v, val: float(v) >= float(val) if v else False,
            "less_or_equal": lambda v, val: float(v) <= float(val) if v else False,
            "is_empty": lambda v, val: not v or (hasattr(v, '__len__') and len(v) == 0),
            "is_not_empty": lambda v, val: bool(v) and (not hasattr(v, '__len__') or len(v) > 0),
            "is_true": lambda v, val: bool(v) is True,
            "is_false": lambda v, val: bool(v) is False,
        }
        
        op_func = operators.get(operator, lambda v, val: v == val)
        
        try:
            return op_func(var_value, value)
        except Exception as e:
            print(f"[DocTemplateService] Condition evaluation error: {e}")
            return False
    
    def _evaluate_string_condition(
        self, 
        condition: str, 
        context: Dict[str, Any]
    ) -> bool:
        """
        Evaluate string condition using Jinja2.
        
        Legacy support for conditions like: "user_role == 'admin'"
        """
        try:
            # Wrap in Jinja2 if statement
            template_str = f"{{% if {condition} %}}true{{% endif %}}"
            template = self.jinja_env.from_string(template_str)
            result = template.render(**context)
            return result.strip() == "true"
        except Exception as e:
            print(f"[DocTemplateService] String condition error: {e}")
            return False
    
    def _build_instruction_system_prompt(self, level_of_detail: str) -> str:
        """
        Build system prompt for instruction processing.
        
        Level of Detail guides the format, NOT quality:
        - brief: bullet points, single paragraph
        - standard: few paragraphs with structure
        - detailed: comprehensive multi-paragraph content
        """
        detail_guidance = {
            "brief": (
                "Format your response as a concise summary. "
                "Use bullet points or a single short paragraph. "
                "Focus on key points only."
            ),
            "standard": (
                "Format your response with clear structure. "
                "Use 2-3 paragraphs with logical flow. "
                "Balance detail with readability."
            ),
            "detailed": (
                "Provide comprehensive, in-depth content. "
                "Use multiple paragraphs with thorough explanations. "
                "Include relevant examples and context."
            ),
        }
        
        detail_text = detail_guidance.get(level_of_detail, detail_guidance["standard"])
        
        return f"""You are a document content generator.

TASK: Generate content based on the instruction provided.

FORMAT REQUIREMENTS:
{detail_text}

RULES:
1. Follow the instruction exactly
2. Do NOT include section headers unless asked
3. Do NOT add meta-commentary about the task
4. Write in a professional, clear style
5. If data is provided, use it accurately
"""
    
    def _build_instruction_user_prompt(
        self, 
        instruction: str, 
        context: Dict[str, Any]
    ) -> str:
        """Build user prompt with instruction and relevant context."""
        # Extract relevant context (exclude internal keys)
        relevant_context = {
            k: v for k, v in context.items() 
            if not k.startswith("_") and v is not None
        }
        
        # Build context section if we have data
        context_section = ""
        if relevant_context:
            context_items = []
            for key, value in relevant_context.items():
                if isinstance(value, (list, dict)):
                    value_str = json.dumps(value, indent=2)[:1000]
                else:
                    value_str = str(value)[:500]
                context_items.append(f"**{key}**: {value_str}")
            
            if context_items:
                context_section = "\n\nAVAILABLE DATA:\n" + "\n".join(context_items)
        
        return f"""INSTRUCTION: {instruction}{context_section}

Generate the content now:"""
    
    async def _generate_with_ai(
        self, 
        system_prompt: str, 
        user_prompt: str,
        context: Dict[str, Any],
        response_format: Optional[Dict[str, Any]] = None
    ) -> str:
        """
        Call the LLM service to generate content.
        
        Uses the configured LLM service or imports the default one.
        """
        # Import LLM service if not provided
        if self.llm_service is None:
            from app.services.llm_service import llm_service
            self.llm_service = llm_service
        
        try:
            from app.models.chat import Message
            
            messages = [
                Message(role="system", content=system_prompt),
                Message(role="user", content=user_prompt)
            ]
            
            # Get model from context if available
            model = context.get("_model")
            
            call_kwargs = {"messages": messages}
            if model:
                call_kwargs["model_name"] = model
            if response_format:
                call_kwargs["response_format"] = response_format
            
            response = await self.llm_service.chat(**call_kwargs)
            
            return response.strip() if response else ""
            
        except Exception as e:
            print(f"[DocTemplateService] AI generation error: {e}")
            return f"[Error generating content: {e}]"


# Singleton instance
document_template_service = DocumentTemplateService()
