import re
from typing import List, Optional, Dict, Any, Union
from pydantic import BaseModel

class TemplateInstruction(BaseModel):
    text: str
    context: Optional[str] = None # e.g. "loop_item"

class ConditionalBlock(BaseModel):
    condition: str
    if_content: List[Any] # Recursive: can contain Sections, Loops, Instructions
    else_content: List[Any] = []

class LoopBlock(BaseModel):
    source: str
    content: List[Any]

class TemplateSection(BaseModel):
    title: str
    level: int
    content: str # Raw markdown content 
    instructions: List[TemplateInstruction]
    children: List[Any] = [] # Supports recursive structures for Logic

class TemplateBlueprint(BaseModel):
    sections: List[TemplateSection]
    constraints: List[str] = []

class TemplateParser:
    """
    Parses Markdown Blueprints into structured TemplateBlueprint objects.
    Supports Nested Loops, Conditionals, and Instructions.
    """
    
    def parse(self, markdown_content: str) -> TemplateBlueprint:
        """
        Parses the markdown content to extract sections and logical blocks.
        Uses a stack-based parser to handle nesting of Loops and IFs.
        """
        lines = markdown_content.split('\n')
        
        # Root container
        # Since sections are top-level often BUT can contain logic, we treat "Blueprint" as a list of Sections.
        # However, new spec allows logic inside sections.
        
        sections: List[TemplateSection] = []
        current_section: Optional[TemplateSection] = None
        
        # We need a stack to track "Where are we adding items?"
        # The stack items will be lists: [section.children, loop.content, if.content, else.content]
        # But wait, Sections are top level constraints usually. 
        # Let's keep it simple: Top level is Sections. Inside Section -> List of Logic/Instructions.
        
        # Stack: [{'type': 'section', 'obj': section_obj, 'list': section.children}, {'type': 'loop', ...}]
        stack = []

        # Regex
        instruction_regex = re.compile(r'<!--\s*INSTRUCTIONS?:\s*(.*?)\s*-->', re.IGNORECASE)
        begin_loop_regex = re.compile(r'<!--\s*BEGIN LOOP:\s*(.*?)\s*-->', re.IGNORECASE)
        end_loop_regex = re.compile(r'<!--\s*END LOOP\s*-->', re.IGNORECASE)
        if_regex = re.compile(r'<!--\s*IF:\s*(.*?)\s*-->', re.IGNORECASE)
        else_regex = re.compile(r'<!--\s*ELSE\s*-->', re.IGNORECASE)
        endif_regex = re.compile(r'<!--\s*ENDIF\s*-->', re.IGNORECASE)
        header_regex = re.compile(r'^(#{1,6})\s+(.*)')

        # State for multi-line instruction parsing
        in_instruction_block = False
        instruction_buffer = []

        for line in lines:
            line = line.strip()
            
            # --- 0. Handle Multi-Line Instruction Block ---
            if in_instruction_block:
                if "-->" in line:
                    # End of block
                    parts = line.split("-->", 1)
                    instruction_buffer.append(parts[0].strip())
                    
                    full_instr_text = " ".join(instruction_buffer).strip()
                    
                    # Add to context
                    current_list.append(TemplateInstruction(text=full_instr_text))
                    if current_section:
                        current_section.instructions.append(TemplateInstruction(text=full_instr_text))
                        
                    in_instruction_block = False
                    instruction_buffer = []
                    
                    # Process remainder of line? Usually nothing after -->
                    continue
                else:
                    # accumulate
                    instruction_buffer.append(line)
                    continue

            # --- 1. Headers (Top Level or breaking loop?) ---
            header_match = header_regex.match(line)
            if header_match:
                # Headers effectively reset the stack to the Root? 
                # Or simply end the current section.
                # Assuming Sections are peers.
                
                title = header_match.group(2).strip()
                level = len(header_match.group(1))
                
                new_section = TemplateSection(
                    title=title,
                    level=level,
                    content="",
                    instructions=[],
                    children=[]
                )
                sections.append(new_section)
                current_section = new_section
                
                # Reset stack to point to this new section's children
                stack = [{'type': 'section', 'obj': new_section, 'list': new_section.children}]
                continue
                
            # If no section yet, skip content or handle as prelude? 
            if not stack: 
                continue

            current_context = stack[-1]
            current_list = current_context['list']
            
            # --- 2. Loop Start ---
            loop_start_match = begin_loop_regex.search(line)
            if loop_start_match:
                source = loop_start_match.group(1).strip()
                new_loop = LoopBlock(source=source, content=[])
                current_list.append(new_loop)
                stack.append({'type': 'loop', 'obj': new_loop, 'list': new_loop.content})
                continue
                
            # --- 3. Loop End ---
            if end_loop_regex.search(line):
                # Pop until we find a loop
                # Robustness: Find nearest loop from top
                if stack and stack[-1]['type'] == 'loop':
                    stack.pop()
                elif any(s['type'] == 'loop' for s in stack):
                     # Deep unwind if missing tags
                     while stack and stack[-1]['type'] != 'loop':
                         stack.pop()
                     if stack: stack.pop() # Pop the loop itself
                continue

            # --- 4. IF Start ---
            if_match = if_regex.search(line)
            if if_match:
                condition = if_match.group(1).strip()
                new_if = ConditionalBlock(condition=condition, if_content=[], else_content=[])
                current_list.append(new_if)
                stack.append({'type': 'if', 'obj': new_if, 'list': new_if.if_content})
                continue

            # --- 5. ELSE ---
            if else_regex.search(line):
                # We expect to be in an 'if' context
                if stack and stack[-1]['type'] == 'if':
                     # Switch list to else_content
                     stack[-1]['type'] = 'else' # Mark as else phase
                     stack[-1]['list'] = stack[-1]['obj'].else_content
                continue
                
            # --- 6. ENDIF ---
            if endif_regex.search(line):
                 if stack and (stack[-1]['type'] == 'if' or stack[-1]['type'] == 'else'):
                     stack.pop()
                 continue
            
            # --- 7. Instructions ---
            # Check for start of instruction
            # Support both single-line "<!-- INSTRUCTION: ... -->" and multi-line "<!-- INSTRUCTION: ..."
            start_instr_match = re.search(r'<!--\s*INSTRUCTIONS?:\s*(.*)', line, re.IGNORECASE)
            if start_instr_match:
                content_start = start_instr_match.group(1).strip()
                
                # Check if it closes on the same line
                if "-->" in content_start:
                    parts = content_start.split("-->", 1)
                    instr_text = parts[0].strip()
                    
                    # Add Logic
                    current_list.append(TemplateInstruction(text=instr_text))
                    if current_section:
                        current_section.instructions.append(TemplateInstruction(text=instr_text))
                else:
                    # Start of multi-line
                    in_instruction_block = True
                    instruction_buffer.append(content_start)
                continue
            
            # --- 8. Content (Text) ---
            if line:
                 current_list.append(line)
                 if current_section:
                     current_section.content += line + "\n"

        return TemplateBlueprint(sections=sections)

    def parse_json_structure(self, blocks: List[Dict[str, Any]]) -> TemplateBlueprint:
        """
        Parses JSON blocks from Structure Builder into a TemplateBlueprint.
        This handles the JSON block format: {'id', 'type', 'title', 'content', 'children'}.
        """
        sections: List[TemplateSection] = []

        def process_block(block: Dict[str, Any], depth: int = 0) -> Any:
            """
            Recursively process a single block from the JSON structure.
            """
            b_type = block.get("type", "section")
            b_title = block.get("title") or block.get("label") or ""
            b_content = block.get("content") or ""
            b_children = block.get("children") or []

            # Skip frontmatter blocks - they are metadata, not content
            if b_type == "frontmatter":
                return None

            # Map block types to parser types
            if b_type == "section":
                # Process children recursively
                child_items = []
                child_instructions = []
                for child in b_children:
                    processed = process_block(child, depth + 1)
                    if processed:
                        if isinstance(processed, TemplateInstruction):
                            child_instructions.append(processed)
                        child_items.append(processed)

                section = TemplateSection(
                    title=b_title,
                    level=depth + 2,  # ## for depth 0, ### for depth 1, etc.
                    content=b_content,
                    instructions=child_instructions,
                    children=child_items
                )
                return section

            elif b_type == "instruction":
                return TemplateInstruction(text=b_content or b_title)

            elif b_type == "text":
                # Raw text is treated as an instruction
                if b_content:
                    return TemplateInstruction(text=b_content)
                return None

            elif b_type == "loop":
                loop_source = block.get("loopSource") or "items"
                loop_content = []
                for child in b_children:
                    processed = process_block(child, depth + 1)
                    if processed:
                        loop_content.append(processed)
                return LoopBlock(source=loop_source, content=loop_content)

            elif b_type == "if":
                condition = b_content or "true"
                if_content = []
                for child in b_children:
                    processed = process_block(child, depth + 1)
                    if processed:
                        if_content.append(processed)
                return ConditionalBlock(
                    condition=condition,
                    if_content=if_content,
                    else_content=[]
                )

            elif b_type == "else":
                # Else blocks are handled by ConditionalBlock, but standalone, treat children
                else_content = []
                for child in b_children:
                    processed = process_block(child, depth + 1)
                    if processed:
                        else_content.append(processed)
                # Return as a simple section wrapper for now
                if else_content:
                    return TemplateSection(
                        title="Else",
                        level=depth + 2,
                        content="",
                        instructions=[],
                        children=else_content
                    )
                return None

            return None

        # Process top-level blocks
        for block in blocks:
            processed = process_block(block, depth=0)
            if processed:
                if isinstance(processed, TemplateSection):
                    sections.append(processed)
                else:
                    # Wrap non-section items in a default section
                    wrapper = TemplateSection(
                        title="Content",
                        level=2,
                        content="",
                        instructions=[processed] if isinstance(processed, TemplateInstruction) else [],
                        children=[processed] if not isinstance(processed, TemplateInstruction) else []
                    )
                    sections.append(wrapper)

        return TemplateBlueprint(sections=sections)

    def validate(self, markdown_content: str) -> List[str]:
        errors = []
        begin_loops = len(re.findall(r'<!--\s*BEGIN LOOP:', markdown_content, re.IGNORECASE))
        end_loops = len(re.findall(r'<!--\s*END LOOP\s*-->', markdown_content, re.IGNORECASE))
        if begin_loops != end_loops:
            errors.append(f"Loop mismatch: {begin_loops} Starts vs {end_loops} Ends")
            
        ifs = len(re.findall(r'<!--\s*IF:', markdown_content, re.IGNORECASE))
        endifs = len(re.findall(r'<!--\s*ENDIF', markdown_content, re.IGNORECASE))
        if ifs != endifs:
             errors.append(f"Condition mismatch: {ifs} IFs vs {endifs} ENDIFs")
             
        return errors

    async def ai_validate(self, blueprint: TemplateBlueprint) -> List[str]:
        # Reuse existing validation logic but adapt to new structure
        from app.services.llm_service import llm_service
        from app.models.chat import Message
        
        # Flatten instructions for validation
        instructions_text = []
        for s in blueprint.sections:
            for item in s.children:
                if isinstance(item, TemplateInstruction):
                    instructions_text.append(f"- {item.text}")
                # TODO: Recurse for nested blocks
        
        if not instructions_text: return []

        system_prompt = "You are a Constraint Validator. Return JSON list of errors or empty list."
        user_prompt = f"Validate:\n" + "\n".join(instructions_text)
        
        # Stub for now
        return []

template_parser = TemplateParser()
