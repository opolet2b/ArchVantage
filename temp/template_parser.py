import re
from typing import List, Optional, Dict, Any
from pydantic import BaseModel

class TemplateInstruction(BaseModel):
    text: str
    context: Optional[str] = None # e.g. "loop_item"

class TemplateSection(BaseModel):
    title: str
    level: int
    content: str # Raw markdown content of the section
    instructions: List[TemplateInstruction]
    loop_source: Optional[str] = None # e.g. "DataSource", "List"

class TemplateBlueprint(BaseModel):
    sections: List[TemplateSection]
    constraints: List[str] = []

class TemplateParser:
    """
    Parses Markdown Blueprints into structured TemplateBlueprint objects.
    """
    
    def parse(self, markdown_content: str) -> TemplateBlueprint:
        """
        Parses the markdown content to extract sections, instructions (<!-- INSTRUCTION: ... -->),
        loops (<!-- BEGIN LOOP: ... -->), and other metadata.
        """
        lines = markdown_content.split('\n')
        sections: List[TemplateSection] = []
        current_section: Optional[TemplateSection] = None
        current_loop_source: Optional[str] = None
        
        # Regex for tags
        instruction_regex = re.compile(r'<!--\s*INSTRUCTION:\s*(.*?)\s*-->', re.IGNORECASE)
        begin_loop_regex = re.compile(r'<!--\s*BEGIN LOOP:\s*(.*?)\s*-->', re.IGNORECASE)
        end_loop_regex = re.compile(r'<!--\s*END LOOP\s*-->', re.IGNORECASE)
        
        # Regex for headers
        header_regex = re.compile(r'^(#{1,6})\s+(.*)')

        for line in lines:
            line = line.strip()
            
            # Check for generic constraints or metadata (maybe specific tag?)
            # For now assuming constraints are defined elsewhere or implicit.
            
            # 1. Handle Loop Tags
            loop_start_match = begin_loop_regex.search(line)
            if loop_start_match:
                current_loop_source = loop_start_match.group(1).strip()
                continue
                
            loop_end_match = end_loop_regex.search(line)
            if loop_end_match:
                current_loop_source = None
                continue

            # 2. Handle Headers (New Section)
            header_match = header_regex.match(line)
            if header_match:
                level = len(header_match.group(1))
                title = header_match.group(2).strip()
                
                # Close previous section if needed (not strictly necessary as we append to list)
                
                new_section = TemplateSection(
                    title=title,
                    level=level,
                    content="", # Will build up
                    instructions=[],
                    loop_source=current_loop_source
                )
                sections.append(new_section)
                current_section = new_section
                continue
            
            # 3. Handle Content & Instructions
            if current_section:
                current_section.content += line + "\n"
                
                instruction_match = instruction_regex.search(line)
                if instruction_match:
                    instruction_text = instruction_match.group(1).strip()
                    current_section.instructions.append(TemplateInstruction(
                        text=instruction_text,
                        context=current_section.loop_source
                    ))

        return TemplateBlueprint(sections=sections)

    def validate(self, markdown_content: str) -> List[str]:
        """
        Validates the markdown content for syntax errors.
        Returns a list of error messages.
        """
        errors = []
        # Basic validation: Check for unclosed loops
        begin_loops = len(re.findall(r'<!--\s*BEGIN LOOP:', markdown_content, re.IGNORECASE))
        end_loops = len(re.findall(r'<!--\s*END LOOP\s*-->', markdown_content, re.IGNORECASE))
        
        if begin_loops != end_loops:
            errors.append(f"Mismatched loop tags: found {begin_loops} BEGIN LOOP and {end_loops} END LOOP tags.")
            
        return errors

    async def ai_validate(self, blueprint: TemplateBlueprint) -> List[str]:
        """
        Uses an LLM to verify that the instructions are technically feasible
        and constraints are met.
        """
        from app.services.llm_service import llm_service
        from app.models.chat import Message

        # Construct the validation prompt
        instructions_text = "\n".join([f"- {i.text} (Context: {i.context or 'Global'})" for section in blueprint.sections for i in section.instructions])
        
        system_prompt = """You are a Blueprint Constraints Validator.
Your job is to analyze a list of Data Extraction/Analysis instructions and verify they are feasible for an AI system.
Constraint: The system can extract data from text, search the web (if enabled), and perform logical deduction.
Constraint: The system CANNOT access private user data not provided in the context, nor perform physical actions.

Return a JSON list of error strings. If all are valid, return an empty list: [].
Example Error: "Instruction 'Interview the CEO' is not feasible as the system cannot perform live interviews."
"""
        
        user_prompt = f"""
Validate the following instructions:
{instructions_text}

JSON Response:
"""
        messages = [
            Message(role="system", content=system_prompt),
            Message(role="user", content=user_prompt)
        ]

        try:
            response = await llm_service.chat(messages, model_name="gpt-4o") # Use a smart model for validation
            # Clean response to ensure it's just the JSON list
            import json
            cleaned_response = response.strip()
            if cleaned_response.startswith("```json"):
                cleaned_response = cleaned_response[7:-3]
            elif cleaned_response.startswith("```"):
                cleaned_response = cleaned_response[3:-3]
            
            errors = json.loads(cleaned_response)
            if isinstance(errors, list):
                return errors
            return []
        except Exception as e:
            print(f"Constraint Validation failed: {e}")
            return [f"Validation system error: {str(e)}"]

template_parser = TemplateParser()
