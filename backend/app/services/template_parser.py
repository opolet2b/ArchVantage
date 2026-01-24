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
        instruction_regex = re.compile(r'<!--\s*INSTRUCTION:\s*(.*?)\s*-->', re.IGNORECASE)
        begin_loop_regex = re.compile(r'<!--\s*BEGIN LOOP:\s*(.*?)\s*-->', re.IGNORECASE)
        end_loop_regex = re.compile(r'<!--\s*END LOOP\s*-->', re.IGNORECASE)
        if_regex = re.compile(r'<!--\s*IF:\s*(.*?)\s*-->', re.IGNORECASE)
        else_regex = re.compile(r'<!--\s*ELSE\s*-->', re.IGNORECASE)
        endif_regex = re.compile(r'<!--\s*ENDIF\s*-->', re.IGNORECASE)
        header_regex = re.compile(r'^(#{1,6})\s+(.*)')

        for line in lines:
            line = line.strip()
            
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
            instruction_match = instruction_regex.search(line)
            if instruction_match:
                # Add to both the raw list structure AND the simple 'instructions' list for legacy compat
                instr_text = instruction_match.group(1).strip()
                
                # Add to context list
                current_list.append(TemplateInstruction(text=instr_text))
                
                # Also populate the simple flat list if we are directly in a section
                if current_section and current_context['type'] == 'section':
                    current_section.instructions.append(TemplateInstruction(text=instr_text))
                continue
            
            # --- 8. Content (Text) ---
            if line:
                 current_list.append(line)
                 if current_section:
                     current_section.content += line + "\n"

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
