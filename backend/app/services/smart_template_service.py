from sqlalchemy.orm import Session
from typing import List, Optional
from app.models import smart_template as models
from app.models.smart_template import SmartOutputFormat
from app.schemas import smart_template as schemas
from app.models.canvas_models import CanvasThing, Domain, ThingType, CanvasLink
from app.schemas import canvas_schemas
from app.services.agent_runtime import AgentRuntime
from app.services.rag_service import rag_service
from app.models.asset_models import Asset
from app.services.asset_service import asset_service
from llama_index.core import SimpleDirectoryReader
from typing import Dict, Any
import json
import os
from datetime import datetime
from app.schemas.smart_contracts import AssetRef, ExtractorInput, ExtractionInstructions
from app.services.conversation_service import conversation_service
from app.services.llm_service import llm_service
from app.services.document_template_service import document_template_service

class SmartTemplateService:
    
    # --- Iterative Engine (Phase 2 & 3) ---

    async def _review_document(self, content: str, purpose: str, model: str = "gpt-4o", level_of_detail: str = "medium", cycle_index: int = 1) -> tuple[int, str, dict]:
        """
        Phase 2: Auditor/Reviewer.
        
        Checks the draft against QUALITY metrics:
        - Accuracy: Does content match the instructions?
        - Reasoning: Is the logic sound and well-structured?
        - Relevance: Does content serve the stated purpose?
        - Clarity: Is the writing clear and professional?
        
        NOTE: Level of Details is a FORMAT constraint, NOT a quality metric.
        The auditor should NOT penalize for length - only for quality issues.
        """
        # Level of Details is INFORMATIONAL only - tells auditor what format was requested
        lod_descriptions = {
            "brief": "Brief format: bullet points and short paragraphs were requested.",
            "standard": "Standard format: balanced sections with moderate detail were requested.",
            "detailed": "Detailed format: comprehensive explanations with examples were requested."
        }
        lod_info = lod_descriptions.get(level_of_detail, lod_descriptions["standard"])
        
        # Cycle-Specific Focus (but NOT length-based)
        cycle_focus = ""
        if cycle_index == 1:
            cycle_focus = (
                "FOCUS THIS CYCLE: Structure and Purpose alignment. "
                "Check if section headers are logical and content serves the purpose."
            )
        else:
            cycle_focus = (
                "FOCUS THIS CYCLE: Content Quality and Accuracy. "
                "Check if arguments are sound, facts are accurate, and writing is clear."
            )
        
        system_prompt = (
            "You are an expert Document Quality Auditor.\n\n"
            "IMPORTANT: You are evaluating QUALITY, not FORMAT.\n"
            f"{lod_info}\n"
            f"{cycle_focus}\n\n"
            "QUALITY METRICS (what you should score):\n"
            "1. purpose_match: Does the content fulfill the stated purpose? (0-100)\n"
            "2. instruction_match: Does the content follow the template instructions? (0-100)\n"
            "3. overall_consistency: Is the document internally consistent in its arguments and tone? (0-100)\n"
            "4. accuracy: Are facts, logic, and reasoning sound? (0-100)\n"
            "5. clarity: Is the writing clear, professional, and well-organized? (0-100)\n\n"
            "DO NOT penalize based on length or format - that was the user's choice.\n"
            "ONLY penalize for actual quality issues:\n"
            "- Missing required content\n"
            "- Factual errors or poor reasoning\n"
            "- Unclear or confusing writing\n"
            "- Internal contradictions (Consistency issues)\n"
            "- Content that doesn't match the stated purpose\n\n"
            "Return ONLY a valid JSON object (no markdown):\n"
            "{\n"
            "  \"metrics\": {\n"
            "    \"purpose_match\": <0-100>,\n"
            "    \"instruction_match\": <0-100>,\n"
            "    \"overall_consistency\": <0-100>,\n"
            "    \"accuracy\": <0-100>,\n"
            "    \"clarity\": <0-100>\n"
            "  },\n"
            "  \"score\": <overall weighted score 0-100>,\n"
            "  \"feedback\": \"<concise markdown bullet points>\",\n"
            "  \"issues\": [\"<specific issue to fix>\"]\n"
            "}\n"
            "Constraints:\n"
            "- Feedback must be actionable for the editor.\n"
            "- Only list issues that genuinely reduce quality.\n"
            "- A well-written brief document can score 100.\n"
            "- Return ONLY the JSON object."
        )
        
        # Truncate content if too long
        safe_content = content[:30000] if len(content) > 30000 else content
        
        user_prompt = (
            f"DOCUMENT PURPOSE: {purpose}\n"
            f"FORMAT REQUESTED: {level_of_detail.upper()} (do NOT score based on this)\n"
            f"REVIEW CYCLE: {cycle_index}\n\n"
            f"DOCUMENT CONTENT:\n{safe_content}\n\n"
            "Evaluate this document's QUALITY. Return ONLY the JSON."
        )

        try:
            response = await llm_service.chat_completion(
                system_prompt=system_prompt,
                user_prompt=user_prompt,
                model=model,
                temperature=0.1,
                json_mode=True
            )
            
            # Robust Parsing Logic
            cleaned = response.strip()
            if cleaned.startswith("```json"): cleaned = cleaned[7:]
            if cleaned.startswith("```"): cleaned = cleaned[3:]
            if cleaned.endswith("```"): cleaned = cleaned[:-3]
            cleaned = cleaned.strip()
            
            data = {}
            try:
                data = json.loads(cleaned)
            except json.JSONDecodeError as json_err:
                print(f"[SmartTemplate] JSON Parse Warning: {json_err}. Raw: {cleaned[:100]}...")
                import re
                match = re.search(r"\{.*\}", cleaned, re.DOTALL)
                if match:
                    try: data = json.loads(match.group(0))
                    except: pass
                
                if not data:
                    print("[SmartTemplate] JSON Recovery failed. Using fallback.")
                    return 50, f"Auditor Output Parse Error. Raw: {cleaned[:500]}...", {}

            # Extract metrics (updated keys)
            metrics = data.get("metrics", {
                "purpose_match": data.get("score", 0),
                "instruction_match": data.get("score", 0),
                "overall_consistency": data.get("score", 0),
                "accuracy": data.get("score", 0),
                "clarity": data.get("score", 0)
            })
            
            return data.get("score", 0), data.get("feedback", "No feedback provided."), metrics
        except Exception as e:
            print(f"[SmartTemplate] Review failed: {e}")
            return 0, f"Auditor Critical Error: {str(e)}", {}

    async def _refine_document(self, content: str, purpose: str, feedback: str, model: str = "gpt-4o", level_of_detail: str = "medium", cycle_index: int = 1) -> str:
        """
        Phase 3: Refinement.
        Updates the draft based on feedback, pushing it towards the Target Detail Level.
        """
        lod_instructions = {
            "low": "TARGET: Short, punchy, bulleted. Remove fluff.",
            "medium": "TARGET: Standard business report. Clear paragraphs.",
            "high": "TARGET: Comprehensive, detailed analysis. Expand deeply."
        }
        target_instr = lod_instructions.get(level_of_detail, lod_instructions["medium"])
        
        cycle_action = ""
        if cycle_index == 1:
            cycle_action = "ACTION: Create a SOLID STRUCTURAL DRAFT. Ignore length deviations for now, just get the structure right."
        else:
            if level_of_detail == "high":
                cycle_action = "ACTION: EXPAND significantly. Add missing details, examples, and depth."
            elif level_of_detail == "low":
                cycle_action = "ACTION: CONDENSE significantly. Merge sentences, use bullets."
            else:
                cycle_action = "ACTION: Refine flow and clarity."

        system_prompt = (
            "You are an expert Editor.\n"
            f"{target_instr}\n"
            f"{cycle_action}\n"
            "Task: Rewrite the document to address the Audit Feedback AND move towards the Target LoD.\n"
            "CRITICAL CONSTRAINTS:\n"
            "1. PRESERVE EXACT SECTION ORDER - DO NOT reorder, merge, or split sections.\n"
            "2. PRESERVE EXACT SECTION HEADERS - Keep all ## and ### headers exactly as they appear.\n"
            "3. DO NOT add new sections or remove existing sections.\n"
            "4. Only modify the CONTENT within each section, never the structure.\n"
            "5. Address every bullet point in feedback.\n"
            "6. Return ONLY the full rewritten document."
        )
        
        user_prompt = (
            f"DOCUMENT PURPOSE: {purpose}\n"
            f"TARGET LO_D: {level_of_detail.upper()}\n"
            f"AUDIT FEEDBACK:\n{feedback}\n\n"
            f"CURRENT DRAFT:\n{content}\n\n"
            "Rewrite the full document now."
        )

        try:
            response = await llm_service.chat_completion(
                system_prompt=system_prompt,
                user_prompt=user_prompt,
                model=model,
                temperature=0.2
            )
            return response
        except Exception as e:
            print(f"[SmartTemplate] Refinement failed: {e}")
            return content # Return original if failure

    def _extract_sections(self, document: str) -> list:
        """
        Extract sections from a markdown document.
        Returns list of dicts with title, content, start_line, end_line.
        """
        import re
        
        sections = []
        lines = document.split('\n')
        current_section = "Initial Content" # Initialize to handle content before first header
        current_section_level = "##" # Default level for initial content
        current_start = 0
        current_content_lines = []
        
        for i, line in enumerate(lines):
            # Match ## or ### headers (section headers)
            header_match = re.match(r'^(#{2,3})\s+(.+)$', line)
            
            if header_match:
                # Save previous section if exists
                if current_section:
                    sections.append({
                        'title': str(current_section).strip(),
                        'content': '\n'.join(current_content_lines).strip(),
                        'start_line': current_start,
                        'end_line': i - 1,
                        'level': len(current_section_level)
                    })
                
                # Start new section
                current_section_level = header_match.group(1)
                current_section = header_match.group(2)
                current_start = i
                current_content_lines = []
            elif current_section:
                current_content_lines.append(line)
        
        # Don't forget the last section
        if current_section:
            sections.append({
                'title': str(current_section).strip(),
                'content': '\n'.join(current_content_lines).strip(),
                'start_line': current_start,
                'end_line': len(lines) - 1,
                'level': len(current_section_level)
            })
        
        return sections

    async def _review_document_with_sections(
        self, 
        document: str, 
        sections: list,
        document_purpose: str, 
        model: str = "gpt-4o",
        min_quality: int = 70
    ) -> dict:
        """
        HYBRID APPROACH: Single LLM call to review ENTIRE document,
        returning per-section quality scores.
        
        Returns:
            {
                "overall_score": int,
                "overall_feedback": str,
                "sections": [
                    {"title": str, "score": int, "feedback": str, "issues": list}
                ]
            }
        """
        # Build section list for the prompt
        section_titles = [s['title'] for s in sections]
        section_list_str = "\n".join([f"- {title}" for title in section_titles])
        
        system_prompt = (
            "You are an expert Document Quality Auditor.\n\n"
            "TASK: Review the ENTIRE document and provide:\n"
            "1. An OVERALL quality score (0-100)\n"
            "2. Individual scores for EACH section listed below\n\n"
            f"SECTIONS TO EVALUATE:\n{section_list_str}\n\n"
            "QUALITY CRITERIA (score 0-100 each):\n"
            "1. purpose_match: Does content fulfill its purpose?\n"
            "2. instruction_match: Does content follow template instructions?\n"
            "3. overall_consistency: Is the document internally consistent?\n"
            "4. accuracy: Are facts and reasoning sound?\n"
            "5. clarity: Is writing clear and professional?\n\n"
            f"QUALITY TARGET: {min_quality}/100\n\n"
            "Return ONLY valid JSON in this EXACT format:\n"
            "{\n"
            '  "overall_score": <0-100>,\n'
            '  "overall_feedback": "<concise summary of document quality>",\n'
            '  "metrics": {\n'
            '    "purpose_match": <0-100>,\n'
            '    "instruction_match": <0-100>,\n'
            '    "overall_consistency": <0-100>,\n'
            '    "accuracy": <0-100>,\n'
            '    "clarity": <0-100>\n'
            '  },\n'
            '  "sections": [\n'
            '    {"title": "<exact section title>", "score": <0-100>, "feedback": "<specific feedback>", "issues": ["<issue1>", "<issue2>"]},\n'
            "    ...\n"
            "  ]\n"
            "}\n\n"
            "IMPORTANT:\n"
            "- Include ALL sections in your response\n"
            "- Use EXACT section titles as listed above\n"
            "- Only flag genuine quality issues"
        )
        
        # Truncate document if too long
        safe_content = document[:30000] if len(document) > 30000 else document
        
        user_prompt = (
            f"DOCUMENT PURPOSE: {document_purpose}\n\n"
            f"FULL DOCUMENT:\n{safe_content}\n\n"
            "Evaluate this document and return the JSON with per-section scores."
        )
        
        try:
            response = await llm_service.chat_completion(
                system_prompt=system_prompt,
                user_prompt=user_prompt,
                model=model,
                temperature=0.1,
                json_mode=True
            )
            
            # Parse response
            import re
            clean = llm_service._extract_json(response)
            
            try:
                data = json.loads(clean)
            except json.JSONDecodeError as e:
                print(f"[SmartTemplate] Hybrid review JSON parse failed: {e}")
                print(f"[SmartTemplate] RAW RESPONSE:\n{response}")
                # Fallback: return overall score only
                return {
                    "overall_score": 50,
                    "overall_feedback": f"JSON parse error: {e}",
                    "sections": []
                }
            
            # Validate and normalize response
            result = {
                "overall_score": int(data.get("overall_score", 50)),
                "overall_feedback": data.get("overall_feedback", "Review completed."),
                "metrics": data.get("metrics", {
                    "purpose_match": data.get("overall_score", 50),
                    "instruction_match": data.get("overall_score", 50),
                    "overall_consistency": data.get("overall_score", 50),
                    "accuracy": data.get("overall_score", 50),
                    "clarity": data.get("overall_score", 50)
                }),
                "sections": []
            }
            
            # Process each section from response
            for section_data in data.get("sections", []):
                title = section_data.get("title", "Unknown")
                
                # Find matching original section to get content
                matching = next((s for s in sections if s['title'] == title), None)
                
                result["sections"].append({
                    "title": title,
                    "score": int(section_data.get("score", 50)),
                    "feedback": section_data.get("feedback", ""),
                    "issues": section_data.get("issues", []),
                    "content": matching['content'] if matching else "",
                    "start_line": matching['start_line'] if matching else 0,
                    "end_line": matching['end_line'] if matching else 0
                })
            
            print(f"[SmartTemplate] Hybrid review complete: {result['overall_score']}/100, {len(result['sections'])} sections evaluated")
            return result
            
        except Exception as e:
            print(f"[SmartTemplate] Hybrid review failed: {e}")
            import traceback
            traceback.print_exc()
            return {
                "overall_score": 0,
                "overall_feedback": f"Review failed: {e}",
                "sections": []
            }

    async def _review_section(
        self, 
        section: dict, 
        document_purpose: str, 
        model: str = "gpt-4o"
    ) -> dict:
        """
        Review a single section for quality.
        Returns dict with section info, score, feedback, and pass/fail status.
        """
        system_prompt = (
            "You are a Section Quality Auditor.\n\n"
            "Evaluate this section's QUALITY on a 0-100 scale:\n"
            "- Does the content serve its purpose?\n"
            "- Is the writing clear and accurate?\n"
            "- Is it well-structured?\n\n"
            "Return ONLY a valid JSON object:\n"
            "{\n"
            "  \"score\": <0-100>,\n"
            '  \"reasoning\": "<concise markdown explanation of why this score was given>",\n'
            '  \"feedback\": "<concise improvement suggestions>",\n'
            '  \"issues\": ["<issue1>", "<issue2>"]\n'
            "}\n\n"
            "If the section is good, score 80+ and minimal issues."
        )
        
        user_prompt = (
            f"DOCUMENT PURPOSE: {document_purpose}\n"
            f"SECTION TITLE: {section['title']}\n\n"
            f"SECTION CONTENT:\n{section['content'][:5000]}\n\n"
            "Evaluate this section. Return ONLY the JSON."
        )
        
        try:
            response = await llm_service.chat_completion(
                system_prompt=system_prompt,
                user_prompt=user_prompt,
                model=model,
                temperature=0.1,
                max_tokens=500
            )
            
            # Parse response
            import json
            import re
            
            # Clean response using LLMService helper
            clean = llm_service._extract_json(response)
            
            if not clean or clean == response and not clean.strip().startswith('{'):
                print(f"[SmartTemplate] WARNING: No JSON found in response for '{section['title']}'. Raw: {response[:100]}...")
                # Try to find any digits if score is missing
                data = {}
            else:
                data = json.loads(clean)
            
            # Ensure score is numeric
            try:
                score = int(float(data.get('score', 0)))
            except:
                score = 0
            
            return {
                'title': section['title'],
                'content': section['content'],
                'start_line': section['start_line'],
                'end_line': section['end_line'],
                'score': score,
                'reasoning': str(data.get('reasoning', '')),
                'feedback': str(data.get('feedback', '')),
                'issues': data.get('issues', []),
                'status': 'pass' if score >= 70 else 'needs_refinement'
            }
            
        except Exception as e:
            print(f"[SmartTemplate] Section review failed for '{section['title']}': {e}")
            return {
                'title': section['title'],
                'content': section['content'],
                'start_line': section['start_line'],
                'end_line': section['end_line'],
                'score': 50,  # Default middle score
                'reasoning': 'Error during section review.',
                'feedback': f'Review failed: {e}',
                'issues': [],
                'status': 'error'
            }

    async def _refine_section(
        self, 
        section: dict, 
        document_purpose: str, 
        model: str = "gpt-4o"
    ) -> dict:
        """
        Refine a single section based on feedback.
        Returns a dict with 'thinking' and 'content'.
        """
        system_prompt = (
            "You are a Section Editor.\n\n"
            "Rewrite ONLY this section's content to address the feedback.\n"
            "IMPORTANT:\n"
            "- Keep the same general structure and topic\n"
            "- Address all issues mentioned in feedback\n"
            "- Maintain professional writing quality\n"
            "- Return your response in this EXACT format:\n"
            "<thinking>\n"
            "concise markdown explanation of the improvements made\n"
            "</thinking>\n"
            "<content>\n"
            "the full rewritten section content (NOT the header)\n"
            "</content>"
        )
        
        user_prompt = (
            f"DOCUMENT PURPOSE: {document_purpose}\n"
            f"SECTION TITLE: {section['title']}\n"
            f"QUALITY SCORE: {section['score']}/100\n"
            f"FEEDBACK: {section['feedback']}\n"
            f"ISSUES: {', '.join(section.get('issues', []))}\n\n"
            f"CURRENT CONTENT:\n{section['content']}\n\n"
            "Rewrite this section to fix the issues. Return RESPONSE IN XML FORMAT."
        )
        
        try:
            response = await llm_service.chat_completion(
                system_prompt=system_prompt,
                user_prompt=user_prompt,
                model=model,
                temperature=0.3,
                max_tokens=4000
            )

            # Robust XML Extraction
            import re
            
            # Extract thinking
            thinking = ""
            think_match = re.search(r'<thinking>(.*?)</thinking>', response, re.DOTALL)
            if think_match:
                thinking = think_match.group(1).strip()
            else:
                # Try to find unclosed thinking tag?
                pass

            # Extract content
            content = section['content'] # Default to original
            
            # 1. Look for standard <content>...</content>
            content_match = re.search(r'<content>(.*?)</content>', response, re.DOTALL)
            if content_match:
                content = content_match.group(1).strip()
            
            # 2. Look for <content>... (cutoff/truncated)
            else:
                content_start = re.search(r'<content>(.*)', response, re.DOTALL)
                if content_start:
                    content = content_start.group(1).strip()
                    # Cleanup if it ended with partial tag like </con
                    content = re.sub(r'</?[a-zA-Z]*$', '', content).strip()
            
            return {
                'thinking': thinking or "Addressed feedback and improved content.",
                'content': content
            }
        except Exception as e:
            print(f"[SmartTemplate] Section refinement failed for '{section['title']}': {e}")
            return {
                'thinking': f"Refinement failed: {str(e)}",
                'content': section['content']
            }

    def _replace_section_in_document(self, document: str, section: dict, new_content: str) -> str:
        """
        Replace a section's content in the document while preserving the header.
        Uses regex-based matching instead of line numbers to avoid shifting issues.
        """
        import re
        
        # Escape the section title for regex
        escaped_title = re.escape(section['title'])
        
        # Build pattern to match the header and its content up to the next header or EOF
        # The header level can be ## or ###
        pattern = rf'(^#{2,3}\s+{escaped_title}\s*?\n)(.*?)(?=^#{2,3}\s+|\Z)'
        
        def replace_match(match):
            header = match.group(1)  # Keep the original header
            return header + new_content + '\n\n'
        
        # Replace with MULTILINE and DOTALL flags
        result = re.sub(pattern, replace_match, document, count=1, flags=re.MULTILINE | re.DOTALL)
        
        return result

    async def _resolve_thing_content(self, db: Session, thing: CanvasThing, fragment: Optional[AssetRef] = None) -> str:
        """
        Resolves the text content of a Thing for analysis.
        Prioritizes explicit source fragments, then internal content, then asset service.
        """
        # 1. Fragment Override (if matching ID)
        if fragment and fragment.id == thing.id and fragment.content:
            return fragment.content
            
        # 2. Text Content (JSON/Dict)
        if isinstance(thing.content, dict):
            # Try generated_markdown first (most rich), then text, then markdown
            return (
                thing.content.get("generated_markdown") or 
                thing.content.get("text") or 
                thing.content.get("markdown") or 
                thing.content.get("url") or 
                ""
            )
            
        # 3. Text Content (String)
        if thing.content and isinstance(thing.content, str):
            return thing.content
            
        # 4. Fallback: Check Asset Service if URL type
        # (Simplified for now - can be expanded)
        return ""

    async def execute_template(self, db: Session, request: canvas_schemas.ExecuteTemplateRequest) -> canvas_schemas.ExecuteTemplateResponse:
        # 1. Fetch Template
        template = self.get_template_by_id(db, request.template_id)
        if not template:
            raise ValueError(f"Template with ID {request.template_id} not found.")

        # Parse Execution Config
        exec_config = {}
        template_purpose = ""
        
        # Resolve 'structure' source (linked Document Template or fallback to self)
        structure_source = template.pipeline_config # Default
        if hasattr(template, "document_template_id") and template.document_template_id:
             from app.models.template import Template as DocTemplate
             doc_t = db.query(DocTemplate).filter(DocTemplate.id == template.document_template_id).first()
             if doc_t and doc_t.structure:
                 structure_source = doc_t.structure
        
        if structure_source and isinstance(structure_source, dict):
            exec_config = structure_source.get("execution_config", {})
            template_purpose = structure_source.get("purpose", "")
            
        max_iterations = int(exec_config.get("max_iterations", 1)) # Default 1 if not set
        min_quality = int(exec_config.get("min_quality", 0))       # Default 0 (skip review)

        # 2. Collect Entities
        things = []
        if request.thing_ids:
            things = db.query(CanvasThing).filter(
                CanvasThing.id.in_(request.thing_ids),
                CanvasThing.canvas_id == request.canvas_id
            ).all()
        
        # 3. Construct Inputs (same as before)
        entities_data = []
        for t in things:
             content_summary = await self._resolve_thing_content(db, t, request.source_fragment)
             entities_data.append({
                 "id": t.id,
                 "type": t.type.value,
                 "title": t.title,
                 "content": content_summary
             })
             
        combined_context = "\n\n".join([f"Item: {e['title']} ({e['type']})\n{e['content']}" for e in entities_data])

        # Inject Graph Relationships
        thing_ids = [t.id for t in things]
        if thing_ids:
             rels = db.query(CanvasLink).filter(
                  CanvasLink.source_id.in_(thing_ids),
                  CanvasLink.target_id.in_(thing_ids)
             ).all()
             if rels:
                  combined_context += "\n\nRELATIONSHIPS:\n"
                  id_to_title = {t.id: t.title or t.type.value for t in things}
                  for r in rels:
                       src = id_to_title.get(r.source_id, "Unknown")
                       tgt = id_to_title.get(r.target_id, "Unknown")
                       lbl = r.type.value
                       if r.label: lbl += f": {r.label}"
                       combined_context += f"- {src} --[{lbl}]--> {tgt}\n"
             
        is_doc_template = bool(template.document_template_id) or "Document" in template.category_name
        
        inputs = {
            "selection": entities_data,
            "combined_context": combined_context,
            "canvas_id": request.canvas_id,
            "model": request.model,
            "is_document_template": is_doc_template 
        }
        
        # 4. Execute Draft Generation (Phase 1)
        blueprint_mock = {
            "graph": template.pipeline_config,
            "id": template.id
        }
        
        runtime = AgentRuntime(blueprint_mock, db)
        print(f"[SmartTemplate] Executing template '{template.name}' with {len(entities_data)} items.")
        
        try:
            # PHASE 1: Draft
            result = await runtime.execute(inputs)
            
            # Extract content from result
            final_doc_content = result.get("output", {}).get("final_document") or \
                                result.get("output", {}).get("audited_document") or \
                                result.get("output", {}).get("text") or ""
            
            # PHASE 2 & 3: Audit & Refine Loop
            if final_doc_content and min_quality > 0:
                current_quality = 0
                iteration = 0
                
                print(f"[SmartTemplate] Starting Review Loop. Target: {min_quality}%, Max Cycles: {max_iterations}")
                
                while iteration < max_iterations:
                    iteration += 1
                    
                    # Audit
                    score, feedback = await self._review_document(final_doc_content, template_purpose, request.model)
                    print(f"[SmartTemplate] Cycle {iteration}: Score {score}/{min_quality}")
                    
                    if score >= min_quality:
                        print("[SmartTemplate] Quality Target Met!")
                        break
                        
                    # Refine
                    if iteration < max_iterations:
                        print("[SmartTemplate] Refining Document...")
                        final_doc_content = await self._refine_document(final_doc_content, template_purpose, feedback, request.model)
            
            status_msg = "completed" if result["status"] == "completed" else "failed"
            message = f"Execution completed successfully. (Model: {request.model})"
            if result["status"] == "failed":
                message = f"Execution failed: {result.get('error')} (Model: {request.model})"
            
            # Update the result payload with the refined content if it exists
            # We construct the response but importantly we need to save the REFINED content to the graph result outputs
            # so that persistence (which happens outside execution usually? No, persistence is in execute_template logic usually,
            # wait, execute_template handles persistence?? No, the caller `execute_template` calls `runtime.execute` which DOES NOT persist.
            # Wait, `runtime.execute` returns a dict. Persistence logic is MISSING in `execute_template` shown above.
            # Ah, I see `_execute_template` vs `execute_template`.
            # Let me check where persistence happens.
            # Persistence logic seems to be in `execute_template_stream` (lines 1516+) but `execute_template` at 576 just returns a response object.
            # It seems `execute_template` is the synchronous HTTP endpoint one? No, it's async but seemingly synchronous response.
            # Actually, `execute_template_stream` handles the whole flow including persistence.
            # `execute_template` seems to be a wrapper or parallel implementation?
            # The user request probably hits `execute_template_stream` if using the progress bar UI.
            # I must update BOTH or check which one is used.
            # Given the UI has "Execution Status" toast, it uses streaming.
            
            return canvas_schemas.ExecuteTemplateResponse(
                execution_id="temp_execution_id", 
                status=status_msg,
                message=message
            )
        except Exception as e:
            print(f"[SmartTemplate] Execution error: {e}")
            return canvas_schemas.ExecuteTemplateResponse(
                execution_id="error",
                status="failed",
                message=str(e)
            )
    # --- Global Categories ---
    
    def get_global_categories(self, db: Session, context: Optional[str] = None) -> List[models.SmartGlobalCategory]:
        query = db.query(models.SmartGlobalCategory)
        if context:
            query = query.filter(models.SmartGlobalCategory.context == context)
        return query.all()

    def create_global_category(self, db: Session, item: schemas.SmartGlobalCategoryCreate) -> models.SmartGlobalCategory:
        # Check duplicate
        existing = db.query(models.SmartGlobalCategory).filter(
            models.SmartGlobalCategory.name == item.name,
            models.SmartGlobalCategory.context == item.context
        ).first()
        if existing:
            raise ValueError("A category with this name and context already exists.")

        db_item = models.SmartGlobalCategory(**item.dict())
        db.add(db_item)
        db.commit()
        db.refresh(db_item)
        return db_item

    def update_global_category(self, db: Session, item_id: str, item: schemas.SmartGlobalCategoryUpdate) -> Optional[models.SmartGlobalCategory]:
        db_item = db.query(models.SmartGlobalCategory).filter(models.SmartGlobalCategory.id == item_id).first()
        if not db_item:
            return None
        
        for key, value in item.dict(exclude_unset=True).items():
            setattr(db_item, key, value)
        
        db.commit()
        db.refresh(db_item)
        return db_item

    def delete_global_category(self, db: Session, item_id: str) -> bool:
        db_item = db.query(models.SmartGlobalCategory).filter(models.SmartGlobalCategory.id == item_id).first()
        if not db_item:
            return False
            
        # Check usage dependencies based on Context
        
        if db_item.context == "Taxonomy":
            if db.query(models.SmartTemplateTaxonomy).filter(models.SmartTemplateTaxonomy.category_name == db_item.name).first():
                raise ValueError(f"Cannot delete category '{db_item.name}' because it is used in Taxonomies.")
                
        elif db_item.context == "Document Sections":
            if db.query(models.SmartTemplateDocumentSection).filter(models.SmartTemplateDocumentSection.category_name == db_item.name).first():
                raise ValueError(f"Cannot delete category '{db_item.name}' because it is used in Document Sections.")
                
        elif db_item.context == "Frameworks":
            if db.query(models.SmartTemplateFramework).filter(models.SmartTemplateFramework.category_name == db_item.name).first():
                raise ValueError(f"Cannot delete category '{db_item.name}' because it is used in Frameworks.")
            
        db.delete(db_item)
        db.commit()
        return True

    # --- Smart Templates ---

    def get_templates(self, db: Session, skip: int = 0, limit: int = 100) -> List[models.SmartAnalysisTemplate]:
        return db.query(models.SmartAnalysisTemplate).offset(skip).limit(limit).all()

    def create_template(self, db: Session, template: schemas.SmartAnalysisTemplateCreate) -> models.SmartAnalysisTemplate:
        db_template = models.SmartAnalysisTemplate(**template.dict())
        db.add(db_template)
        db.commit()
        db.refresh(db_template)
        return db_template

    def get_template_by_id(self, db: Session, template_id: str) -> Optional[models.SmartAnalysisTemplate]:
        return db.query(models.SmartAnalysisTemplate).filter(models.SmartAnalysisTemplate.id == template_id).first()

    def update_template(self, db: Session, template_id: str, template: schemas.SmartAnalysisTemplateUpdate) -> Optional[models.SmartAnalysisTemplate]:
        db_template = self.get_template_by_id(db, template_id)
        if not db_template:
            return None
        
        update_data = template.dict(exclude_unset=True)
        for key, value in update_data.items():
            setattr(db_template, key, value)
            
        db.commit()
        db.refresh(db_template)
        return db_template

    def delete_template(self, db: Session, template_id: str) -> bool:
        db_template = self.get_template_by_id(db, template_id)
        if not db_template:
            return False
            
        db.delete(db_template)
        db.commit()
        return True

    # --- Taxonomies ---

    def get_taxonomies(self, db: Session) -> List[models.SmartTemplateTaxonomy]:
        return db.query(models.SmartTemplateTaxonomy).all()

    def create_taxonomy(self, db: Session, item: schemas.SmartTemplateTaxonomyCreate) -> models.SmartTemplateTaxonomy:
        # Check duplicate
        existing = db.query(models.SmartTemplateTaxonomy).filter(
            models.SmartTemplateTaxonomy.category_name == item.category_name,
            models.SmartTemplateTaxonomy.activity_type == item.activity_type
        ).first()
        if existing:
            raise ValueError("A taxonomy for this category and activity type already exists.")

        db_item = models.SmartTemplateTaxonomy(**item.dict())
        db.add(db_item)
        db.commit()
        db.refresh(db_item)
        return db_item

    def update_taxonomy(self, db: Session, item_id: str, item: schemas.SmartTemplateTaxonomyUpdate) -> Optional[models.SmartTemplateTaxonomy]:
        db_item = db.query(models.SmartTemplateTaxonomy).filter(models.SmartTemplateTaxonomy.id == item_id).first()
        if not db_item:
            return None
        for key, value in item.dict(exclude_unset=True).items():
            setattr(db_item, key, value)
        db.commit()
        db.refresh(db_item)
        return db_item

    def delete_taxonomy(self, db: Session, item_id: str) -> bool:
        db_item = db.query(models.SmartTemplateTaxonomy).filter(models.SmartTemplateTaxonomy.id == item_id).first()
        if not db_item:
            return False
        db.delete(db_item)
        db.commit()
        return True

    # --- Document Sections ---

    def get_sections(self, db: Session) -> List[models.SmartTemplateDocumentSection]:
        return db.query(models.SmartTemplateDocumentSection).all()

    def create_section(self, db: Session, item: schemas.SmartTemplateDocumentSectionCreate) -> models.SmartTemplateDocumentSection:
        # Check duplicate
        existing = db.query(models.SmartTemplateDocumentSection).filter(
            models.SmartTemplateDocumentSection.name == item.name,
            models.SmartTemplateDocumentSection.category_name == item.category_name
        ).first()
        if existing:
            raise ValueError("A section with this name in this category already exists.")

        db_item = models.SmartTemplateDocumentSection(**item.dict())
        db.add(db_item)
        db.commit()
        db.refresh(db_item)
        return db_item

    def update_section(self, db: Session, item_id: str, item: schemas.SmartTemplateDocumentSectionUpdate) -> Optional[models.SmartTemplateDocumentSection]:
        db_item = db.query(models.SmartTemplateDocumentSection).filter(models.SmartTemplateDocumentSection.id == item_id).first()
        if not db_item:
            return None
        for key, value in item.dict(exclude_unset=True).items():
            setattr(db_item, key, value)
        db.commit()
        db.refresh(db_item)
        return db_item

    def delete_section(self, db: Session, item_id: str) -> bool:
        db_item = db.query(models.SmartTemplateDocumentSection).filter(models.SmartTemplateDocumentSection.id == item_id).first()
        if not db_item:
            return False
        db.delete(db_item)
        db.commit()
        return True

    # --- Personas ---

    def get_personas(self, db: Session) -> List[models.SmartTemplatePersona]:
        return db.query(models.SmartTemplatePersona).all()

    def create_persona(self, db: Session, item: schemas.SmartTemplatePersonaCreate) -> models.SmartTemplatePersona:
        # Check duplicate
        existing = db.query(models.SmartTemplatePersona).filter(
            models.SmartTemplatePersona.role == item.role
        ).first()
        if existing:
            raise ValueError("A persona with this name already exists.")

        db_item = models.SmartTemplatePersona(**item.dict())
        db.add(db_item)
        db.commit()
        db.refresh(db_item)
        return db_item

    def update_persona(self, db: Session, item_id: str, item: schemas.SmartTemplatePersonaUpdate) -> Optional[models.SmartTemplatePersona]:
        db_item = db.query(models.SmartTemplatePersona).filter(models.SmartTemplatePersona.id == item_id).first()
        if not db_item:
            return None
        for key, value in item.dict(exclude_unset=True).items():
            setattr(db_item, key, value)
        db.commit()
        db.refresh(db_item)
        return db_item

    def delete_persona(self, db: Session, item_id: str) -> bool:
        db_item = db.query(models.SmartTemplatePersona).filter(models.SmartTemplatePersona.id == item_id).first()
        if not db_item:
            return False
        db.delete(db_item)
        db.commit()
        return True

    # --- Frameworks ---

    def get_frameworks(self, db: Session) -> List[models.SmartTemplateFramework]:
        return db.query(models.SmartTemplateFramework).all()

    def create_framework(self, db: Session, item: schemas.SmartTemplateFrameworkCreate) -> models.SmartTemplateFramework:
        # Check duplicate
        existing = db.query(models.SmartTemplateFramework).filter(
            models.SmartTemplateFramework.name == item.name
        ).first()
        if existing:
            raise ValueError("A framework with this name already exists.")

        db_item = models.SmartTemplateFramework(**item.dict())
        db.add(db_item)
        db.commit()
        db.refresh(db_item)
        return db_item

    def update_framework(self, db: Session, item_id: str, item: schemas.SmartTemplateFrameworkUpdate) -> Optional[models.SmartTemplateFramework]:
        db_item = db.query(models.SmartTemplateFramework).filter(models.SmartTemplateFramework.id == item_id).first()
        if not db_item:
            return None
        for key, value in item.dict(exclude_unset=True).items():
            setattr(db_item, key, value)
        db.commit()
        db.refresh(db_item)
        return db_item

    def delete_framework(self, db: Session, item_id: str) -> bool:
        db_item = db.query(models.SmartTemplateFramework).filter(models.SmartTemplateFramework.id == item_id).first()
        if not db_item:
            return False
        db.delete(db_item)
        db.commit()
        return True

    # --- Thesauruses ---

    def get_thesauruses(self, db: Session) -> List[models.SmartTemplateThesaurus]:
        return db.query(models.SmartTemplateThesaurus).all()

    def create_thesaurus(self, db: Session, item: schemas.SmartTemplateThesaurusCreate) -> models.SmartTemplateThesaurus:
        # Check duplicate
        existing = db.query(models.SmartTemplateThesaurus).filter(
            models.SmartTemplateThesaurus.name == item.name
        ).first()
        if existing:
            raise ValueError("A thesaurus entry with this name already exists.")

        db_item = models.SmartTemplateThesaurus(**item.dict())
        db.add(db_item)
        db.commit()
        db.refresh(db_item)
        return db_item

    def update_thesaurus(self, db: Session, item_id: str, item: schemas.SmartTemplateThesaurusUpdate) -> Optional[models.SmartTemplateThesaurus]:
        db_item = db.query(models.SmartTemplateThesaurus).filter(models.SmartTemplateThesaurus.id == item_id).first()
        if not db_item:
            return None
        for key, value in item.dict(exclude_unset=True).items():
            setattr(db_item, key, value)
        db.commit()
        db.refresh(db_item)
        return db_item

    def delete_thesaurus(self, db: Session, item_id: str) -> bool:
        db_item = db.query(models.SmartTemplateThesaurus).filter(models.SmartTemplateThesaurus.id == item_id).first()
        if not db_item:
            return False
        db.delete(db_item)
        db.commit()
        return True

    # --- Analysis Templates (Phase 2) ---

    def get_templates(self, db: Session) -> List[models.SmartAnalysisTemplate]:
        return db.query(models.SmartAnalysisTemplate).all()

    def create_template(self, db: Session, item: schemas.SmartAnalysisTemplateCreate) -> models.SmartAnalysisTemplate:
        db_item = models.SmartAnalysisTemplate(**item.dict())
        db.add(db_item)
        db.commit()
        db.refresh(db_item)
        return db_item

    def get_template_by_id(self, db: Session, item_id: str) -> Optional[models.SmartAnalysisTemplate]:
        return db.query(models.SmartAnalysisTemplate).filter(models.SmartAnalysisTemplate.id == item_id).first()

    def update_template(self, db: Session, item_id: str, item: schemas.SmartAnalysisTemplateUpdate) -> Optional[models.SmartAnalysisTemplate]:
        db_item = db.query(models.SmartAnalysisTemplate).filter(models.SmartAnalysisTemplate.id == item_id).first()
        if not db_item:
            return None
        for key, value in item.dict(exclude_unset=True).items():
            setattr(db_item, key, value)
        db.commit()
        db.refresh(db_item)
        return db_item

    async def _resolve_thing_content(self, db: Session, thing: CanvasThing, fragment: Optional[canvas_schemas.FragmentData] = None) -> str:
        """
        Resolve the actual text content of a thing for analysis.
        Priority:
        0. Fragment Content (if specific selection exists)
        1. RAG Search (Vectorized content) - Best for "Full Document" with semantic relevance
        2. Direct File Read (Fallback if RAG missing)
        3. Stored metadata/summaries
        """
        content_summary = ""
        content = thing.content or {}
        
        # 0. Fragment Priority
        if fragment:
            print(f"[ContentResolution] Resolving Fragment Data. Full Object: {fragment.dict() if hasattr(fragment, 'dict') else fragment}")
            print(f"[ContentResolution] Fragment Type: {fragment.type}")
            # Text Fragments: Return content directly
            if fragment.type == "text" and fragment.content:
                print(f"[ContentResolution] Fragment Text Resolved. Len: {len(fragment.content)}")
                return fragment.content
                
            # Region Fragments: Prioritize base64 content (for vision) or return descriptive coordinates
            elif fragment.type == "region":
                if fragment.content and len(fragment.content) > 100:
                    print(f"[ContentResolution] Fragment Region (Image Crop) Resolved. Len: {len(fragment.content)}")
                    return fragment.content
                
                desc = f"[Selected Region at x={fragment.x:.2f}, y={fragment.y:.2f}, w={fragment.width:.2f}, h={fragment.height:.2f}]"
                print(f"[ContentResolution] Fragment Region (Coordinates Only) Resolved: {desc}")
                return desc
                
            # Cell Fragments: Return range/sheet plus content
            elif fragment.type == "cell":
                desc = f"[Selected Cells: {fragment.range} in sheet '{fragment.sheet or 'Default'}']"
                val = fragment.content or ""
                
                # Robust Fallback: Reconstruct from values if content is placeholder or empty
                if (not val or val.startswith("Cells ") or val == "Column Selection") and fragment.values:
                    try:
                        # Join rows with tabs, rows with newlines
                        val = "\n".join(["\t".join([str(c) for c in row]) for row in fragment.values])
                        print(f"[ContentResolution] Reconstructed cell content from values. New Len: {len(val)}")
                    except Exception as e:
                        print(f"[ContentResolution] Failed to reconstruct from values: {e}")

                final = f"{desc}\n{val}"
                print(f"[ContentResolution] Fragment Cell Resolved: {desc}. Content Len: {len(val)}")
                return final
                
            # Generic fallback for other types with content
            elif fragment.content:
                print(f"[ContentResolution] Fragment Generic Resolved. Len: {len(fragment.content)}")
                return fragment.content
                
            else:
                print(f"[ContentResolution] Fragment exists but was NOT resolved (Type: {fragment.type}, Content: {fragment.content is not None})")
        
        print(f"\n[ContentResolution] Resolving content for Thing '{thing.title}' (ID: {thing.id}, Type: {thing.type.value})")
        
        # Strategy for Documents
        if thing.type.value == "document":
            file_path = content.get("file_path")
            
            # 0. Resolve Path from Asset ID (Always prioritize this as content file_path might be a URL)
            if content.get("asset_id"):
                try:
                    asset_id = content.get("asset_id")
                    # print(f"[ContentResolution] Resolving real path for Asset ID: {asset_id}")
                    asset = db.query(Asset).filter(Asset.id == asset_id).first()
                    if asset:
                        # Resolve absolute path using AssetService helper
                        resolved_path = asset_service.get_storage_path(asset)
                        if resolved_path:
                            file_path = str(resolved_path)
                            print(f"[ContentResolution] Resolved file path from Asset: {file_path}")
                        else:
                            print(f"[ContentResolution] Asset found but storage path resolution failed.")
                    else:
                        print(f"[ContentResolution] Asset ID {asset_id} not found in DB.")
                except Exception as e:
                    print(f"[ContentResolution] Asset path resolution error: {e}")

            # 1. Try RAG First (Vectorized Content)
            # Use direct ChromaDB query to retrieve ALL chunks for this source
            # This is more reliable than semantic search with an empty query
            try:
                if file_path:
                    print(f"[ContentResolution] Attempting RAG retrieval for source='{file_path}'")
                    
                    from app.services.rag_service import rag_service
                    
                    # Ensure RAG is initialized
                    if rag_service._initialized and rag_service.chroma_collection:
                        # Query ChromaDB directly for all chunks matching this source
                        # Use 'source' metadata field that was set during ingestion
                        try:
                            results = rag_service.chroma_collection.get(
                                where={"source": file_path},
                                include=["documents", "metadatas"]
                            )
                            
                            if results and results.get("documents") and len(results["documents"]) > 0:
                                documents = results["documents"]
                                print(f"[ContentResolution] RAG Hit! Retrieved {len(documents)} chunks from vector store.")
                                
                                # Reconstruct document from chunks (they should be in order)
                                full_text = "\n\n".join(documents)
                                print(f"[ContentResolution] Reconstructed {len(full_text)} chars from RAG chunks.")
                                return full_text
                            else:
                                print(f"[ContentResolution] No RAG chunks found for source: {file_path}")
                        except Exception as chroma_err:
                            print(f"[ContentResolution] ChromaDB query error: {chroma_err}")
                    else:
                        print("[ContentResolution] RAG service not initialized, skipping.")
                else:
                    print("[ContentResolution] No file_path for RAG lookup.")
                    
            except Exception as e:
                print(f"[ContentResolution] RAG search exception: {e}")

            # 2. Fallback: Direct File Read
            if file_path and os.path.exists(file_path):
                try:
                    print(f"[ContentResolution] Fallback: Reading file explicitly from disk: {file_path}")
                    documents = SimpleDirectoryReader(input_files=[file_path]).load_data()
                    if documents:
                        full_text = "\n\n".join([d.text for d in documents])
                        print(f"[ContentResolution] Direct Read Success. Length: {len(full_text)}")
                        return full_text
                    else:
                        print(f"[ContentResolution] Direct Read returned no documents.")
                except Exception as e:
                    print(f"[ContentResolution] Direct file read exception: {e}")
            else:
                 print(f"[ContentResolution] Skipping Direct Read: File path invalid or does not exist: {file_path}")

            # 3. Content field fallback
            if content.get("content") and isinstance(content.get("content"), str) and len(content.get("content")) > 100:
                 print(f"[ContentResolution] Using cached 'content' field ({len(content['content'])} chars)")
                 return content["content"]

        # Fallbacks (for non-documents or if above failed)
        print(f"[ContentResolution] All primary methods failed. Checking metadata fallbacks...")
        if content.get("generated_description"):
             print(f"[ContentResolution] Using 'generated_description' (VLM output).")
             content_summary = content["generated_description"]
        elif content.get("description"):
             print(f"[ContentResolution] Using 'description' field.")
             content_summary = content["description"]
        elif thing.type.value == "text":
             print(f"[ContentResolution] Using 'text' node content.")
             # Check multiple possible keys for text content
             text_content = (
                 content.get("text") or 
                 content.get("content") or 
                 content.get("text_content") or 
                 content.get("markdown") or 
                 ""
             )
             content_summary = text_content[:10000] # Increased limit
             
        elif thing.type.value == "agent_result":
             print(f"[ContentResolution] Resolving Agent Result content.")
             # Try to extract the final output or relevant parts
             outputs = content.get("outputs", {})
             if isinstance(outputs, dict):
                 # Prefer standard output keys
                 content_summary = (
                     outputs.get("final_response") or 
                     outputs.get("response") or 
                     outputs.get("output") or 
                     outputs.get("answer") or
                     outputs.get("summary") or
                     json.dumps(outputs, indent=2)
                 )
             else:
                 content_summary = str(outputs)
                 
        elif thing.type.value == "url":
             print(f"[ContentResolution] Resolving URL content.")
             # Check if we have scraped content
             content_summary = (
                 content.get("scraped_content") or 
                 content.get("markdown") or 
                 content.get("content") or
                 f"URL: {content.get('url')}\n(No scraped content available)"
             )

        elif thing.type.value == "conversation":
             print(f"[ContentResolution] Resolving Conversation content.")
             conversation_id = content.get("conversation_id")
             if conversation_id:
                 conv = conversation_service.get_conversation(conversation_id)
                 if conv and conv.get("messages"):
                     # Format transcript
                     transcript = []
                     for m in conv["messages"]:
                         role = m.get("role", "unknown").upper()
                         text = m.get("content", "")
                         transcript.append(f"[{role}]: {text}")
                     content_summary = "\n".join(transcript)
                 else:
                     content_summary = "(Empty Conversation)"
             else:
                 content_summary = "(Missing Conversation ID)"

        elif thing.type.value == "message":
            print(f"[ContentResolution] Resolving Single Message.")
            content_summary = content.get("text") or content.get("content") or ""

        elif thing.type.value == "table":
            print(f"[ContentResolution] Resolving Table content.")
            # Handle CSV or JSON data
            if content.get("csv"):
                content_summary = f"Format: CSV\n\n{content['csv'][:10000]}"
            elif content.get("data") and isinstance(content["data"], list):
                # Convert JSON list to string representation
                try:
                    import pandas as pd
                    df = pd.DataFrame(content["data"])
                    content_summary = f"Format: Markdown Table\n\n{df.to_markdown(index=False)}"
                except ImportError:
                     content_summary = f"Format: JSON Data\n\n{json.dumps(content['data'], indent=2)}"
            else:
                 content_summary = str(content)

        elif thing.type.value == "database":
             print(f"[ContentResolution] Resolving Database content.")
             # Extract schema or SQL query results
             schema = content.get("schema")
             if schema:
                 content_summary = f"Database Schema:\n{json.dumps(schema, indent=2)}"
             else:
                 content_summary = str(content)

        elif thing.type.value == "document":
             print(f"[ContentResolution] Resolving Document explicitly (Retry).")
             # Retry resolving from Asset ID if it was missed earlier or failed RAG
             if not content_summary:
                   print(f"[ContentResolution] Start Explicit Load for Asset ID: {content.get('asset_id')}")
                   if content.get("asset_id"):
                       try:
                           asset_id = content.get("asset_id")
                           asset = db.query(Asset).filter(Asset.id == asset_id).first()
                           if asset:
                               f_path = asset_service.get_storage_path(asset)
                               abs_path = os.path.abspath(str(f_path)) if f_path else None
                               
                               print(f"[ContentResolution] Path Resolution: {abs_path}")
                               if abs_path and os.path.exists(abs_path):
                                   print(f"[ContentResolution] File Exists at: {abs_path}")
                                   try:
                                       documents = SimpleDirectoryReader(input_files=[abs_path]).load_data()
                                       if documents:
                                           content_summary = "\n\n".join([d.text for d in documents])
                                           print(f"[ContentResolution] LOAD SUCCESS. Len: {len(content_summary)}")
                                       else:
                                           err_msg = "[ContentResolution] ERROR: SimpleDirectoryReader returned ZERO documents."
                                           print(err_msg)
                                           content_summary = err_msg
                                   except Exception as load_err:
                                       err_msg = f"[ContentResolution] EXCEPTION during load_data: {load_err}"
                                       print(err_msg)
                                       content_summary = err_msg
                               else:
                                   err_msg = f"[ContentResolution] ERROR: File path missing or file not found at {abs_path}"
                                   print(err_msg)
                                   content_summary = err_msg
                           else:
                               print(f"[ContentResolution] ERROR: Asset ID {asset_id} NOT FOUND in DB.")
                       except Exception as e:
                           print(f"[ContentResolution] CRITICAL ERROR in Document Retry: {e}")
                           content_summary = f"[ContentResolution] Critical Error: {e}"
                   else:
                       content_summary = f"Document: {thing.title}\n(Content could not be loaded. Missing Asset ID)"

        else:
             print(f"[ContentResolution] Fallback to raw JSON dump. Type: {thing.type.value}")
             # DEBUG: Why are we here?
             print(f"[ContentResolution] Content keys: {list(content.keys()) if isinstance(content, dict) else 'Not Dict'}")
             if content.get("asset_id"):
                 print(f"[ContentResolution] CRITICAL: Asset ID {content.get('asset_id')} present but file resolution failed!")
                 
             content_summary = str(content)
             
        print(f"[ContentResolution] Final resolved content length: {len(content_summary)}")
        return content_summary

    async def execute_template(self, db: Session, request: canvas_schemas.ExecuteTemplateRequest) -> canvas_schemas.ExecuteTemplateResponse:
        # 1. Fetch Template
        template = self.get_template_by_id(db, request.template_id)
        if not template:
            raise ValueError(f"Template with ID {request.template_id} not found.")

        # 2. Collect Entities
        things = []
        if request.thing_ids:
            things = db.query(CanvasThing).filter(
                CanvasThing.id.in_(request.thing_ids),
                CanvasThing.canvas_id == request.canvas_id
            ).all()
        
        # 3. Construct Inputs
        entities_data = []
        entities_data = []
        for t in things:
             content_summary = await self._resolve_thing_content(db, t, request.source_fragment)

             entities_data.append({
                 "id": t.id,
                 "type": t.type.value,
                 "title": t.title,
                 "content": content_summary
             })
             
        # Create a single string context for templates that expect text
        combined_context = "\n\n".join([f"Item: {e['title']} ({e['type']})\n{e['content']}" for e in entities_data])

        # Inject Graph Relationships
        thing_ids = [t.id for t in things]
        if thing_ids:
             rels = db.query(CanvasLink).filter(
                  CanvasLink.source_id.in_(thing_ids),
                  CanvasLink.target_id.in_(thing_ids)
             ).all()
             
             if rels:
                  combined_context += "\n\nRELATIONSHIPS:\n"
                  id_to_title = {t.id: t.title or t.type.value for t in things}
                  for r in rels:
                       src = id_to_title.get(r.source_id, "Unknown")
                       tgt = id_to_title.get(r.target_id, "Unknown")
                       lbl = r.type.value
                       if r.label:
                           lbl += f": {r.label}"
                       if r.description:
                           lbl += f" ({r.description})"
                       combined_context += f"- {src} --[{lbl}]--> {tgt}\n"
             
        # Determine if this is a Document Template (for Primitive Context)
        is_doc_template = bool(template.document_template_id) or "Document" in template.category_name
        
        inputs = {
            "selection": entities_data,
            "combined_context": combined_context,
            "canvas_id": request.canvas_id,
            "model": request.model,
            "is_document_template": is_doc_template # Explicit Context Flag
        }
        
        # 4. Execute
        # Construct a blueprint-like object for AgentRuntime
        blueprint_mock = {
            "graph": template.pipeline_config,
            "id": template.id
        }
        
        runtime = AgentRuntime(blueprint_mock, db)
        print(f"[SmartTemplate] Executing template '{template.name}' with {len(entities_data)} items.")
        
        try:
            result = await runtime.execute(inputs)
            
            status_msg = "completed" if result["status"] == "completed" else "failed"
            message = f"Execution completed successfully. (Model: {request.model})"
            if result["status"] == "failed":
                message = f"Execution failed: {result.get('error')} (Model: {request.model})"
                
            return canvas_schemas.ExecuteTemplateResponse(
                execution_id="temp_execution_id", # TODO: Persist execution
                status=status_msg,
                message=message
            )
        except Exception as e:
            print(f"[SmartTemplate] Execution error: {e}")
            return canvas_schemas.ExecuteTemplateResponse(
                execution_id="error",
                status="failed",
                message=str(e)
            )

    def delete_template(self, db: Session, item_id: str) -> bool:
        db_item = db.query(models.SmartAnalysisTemplate).filter(models.SmartAnalysisTemplate.id == item_id).first()
        if not db_item:
            return False
        db.delete(db_item)
        db.commit()
        return True

    # --- Rendering Types ---

    def get_rendering_types(self, db: Session) -> List[models.SmartRenderingType]:
        return db.query(models.SmartRenderingType).all()

    def create_rendering_type(self, db: Session, item: schemas.SmartRenderingTypeCreate) -> models.SmartRenderingType:
        # Check duplicate
        existing = db.query(models.SmartRenderingType).filter(
            models.SmartRenderingType.category == item.category,
            models.SmartRenderingType.name == item.name
        ).first()
        if existing:
            raise ValueError("A rendering type with this name in this category already exists.")

        db_item = models.SmartRenderingType(**item.dict())
        db.add(db_item)
        db.commit()
        db.refresh(db_item)
        return db_item

    def update_rendering_type(self, db: Session, item_id: str, item: schemas.SmartRenderingTypeUpdate) -> Optional[models.SmartRenderingType]:
        db_item = db.query(models.SmartRenderingType).filter(models.SmartRenderingType.id == item_id).first()
        if not db_item:
            return None
        for key, value in item.dict(exclude_unset=True).items():
            setattr(db_item, key, value)
        db.commit()
        db.refresh(db_item)
        return db_item

    def delete_rendering_type(self, db: Session, item_id: str) -> bool:
        db_item = db.query(models.SmartRenderingType).filter(models.SmartRenderingType.id == item_id).first()
        if not db_item:
            return False
        db.delete(db_item)
        db.commit()
        return True

    # --- Output Formats ---

    def get_output_formats(self, db: Session) -> List[models.SmartOutputFormat]:
        return db.query(models.SmartOutputFormat).all()

    def create_output_format(self, db: Session, item: schemas.SmartOutputFormatCreate) -> models.SmartOutputFormat:
        # Check duplicate
        existing = db.query(models.SmartOutputFormat).filter(
            models.SmartOutputFormat.type == item.type,
            models.SmartOutputFormat.name == item.name
        ).first()
        if existing:
            raise ValueError("An output format with this type and name already exists.")

        db_item = models.SmartOutputFormat(**item.dict())
        db.add(db_item)
        db.commit()
        db.refresh(db_item)
        return db_item

    def update_output_format(self, db: Session, item_id: str, item: schemas.SmartOutputFormatUpdate) -> Optional[models.SmartOutputFormat]:
        db_item = db.query(models.SmartOutputFormat).filter(models.SmartOutputFormat.id == item_id).first()
        if not db_item:
            return None
        for key, value in item.dict(exclude_unset=True).items():
            setattr(db_item, key, value)
        db.commit()
        db.refresh(db_item)
        return db_item
    async def execute_template_stream(self, db: Session, request: canvas_schemas.ExecuteTemplateRequest):
        """
        Execute a template and yield progress events.
        """
        # 1. Fetch Template
        template = self.get_template_by_id(db, request.template_id)
        if not template:
            yield {"type": "error", "content": f"Template with ID {request.template_id} not found."}
            return

        # --- DEBUG LOGGING for Fragment Issue ---
        print(f"[SmartTemplate] Request Source Fragment: {request.source_fragment}")
        if request.source_fragment:
            print(f"[SmartTemplate] Fragment Type: {request.source_fragment.type}, Content Len: {len(request.source_fragment.content or '')}")
        else:
             print(f"[SmartTemplate] No source_fragment provided in request.")
        # ----------------------------------------

        # 2. Collect Entities
        # RELAXED LOOKUP: Query by ID first to ensure we find the thing even if canvas_id parameter is mismatched
        things = db.query(CanvasThing).filter(
            CanvasThing.id.in_(request.thing_ids)
        ).all()

        # Validation / Filtering
        valid_things = []
        for t in things:
             if str(t.canvas_id) != str(request.canvas_id):
                 print(f"[SmartTemplate] WARNING: Thing {t.id} belongs to canvas {t.canvas_id}, but request is for {request.canvas_id}. Allowing execution but this indicates a state mismatch.")
                 # We allow it to proceed because the User explicitly selected it.
             valid_things.append(t)
        things = valid_things

        # Log if we still missed something
        if request.thing_ids and not things:
             print(f"[SmartTemplate] CRITICAL: Requested thing_ids {request.thing_ids} NOT FOUND in DB (Global Search).")
            

        
        # 3. Construct Strictly Typed Inputs (Pydantic)
        assets = []
        entities_data = [] # Keep for legacy combined_context fallback
        
        for t in things:
             content_summary = await self._resolve_thing_content(db, t, request.source_fragment)
             
             # Create AssetRef
             asset_ref = AssetRef(
                 id=t.id,
                 type=t.type.value,
                 url=None, # TODO: Resolve URL if applicable
                 content=content_summary
             )
             assets.append(asset_ref)

             entities_data.append({
                 "id": t.id,
                 "type": t.type.value,
                 "title": t.title,
                 "content": content_summary
             })
             
        # Create legacy context just in case (for generic nodes)
        combined_context = "\n\n".join([f"Item: {e['title']} ({e['type']})\n{e['content']}" for e in entities_data])
        
        # Inject Graph Relationships (Stream)
        thing_ids = [t.id for t in things]
        if thing_ids:
             rels = db.query(CanvasLink).filter(
                  CanvasLink.source_id.in_(thing_ids),
                  CanvasLink.target_id.in_(thing_ids)
             ).all()
             
             if rels:
                  combined_context += "\n\nRELATIONSHIPS:\n"
                  id_to_title = {t.id: t.title or t.type.value for t in things}
                  for r in rels:
                       src = id_to_title.get(r.source_id, "Unknown")
                       tgt = id_to_title.get(r.target_id, "Unknown")
                       lbl = r.type.value
                       if r.label:
                           lbl += f": {r.label}"
                       if r.description:
                           lbl += f" ({r.description})"
                       combined_context += f"- {src} --[{lbl}]--> {tgt}\n"
        
        # Determine extraction instructions (try to find first Extractor step config)
        extraction_instructions = ExtractionInstructions(focus="Key information related to analysis goals")
        if template.pipeline_config:
            steps = template.pipeline_config.get("steps", [])
            for s in steps:
                s_type = s.get("type", "").lower()
                if "extractor" in s_type:
                    config = s.get("config", {})
                    try:
                        with open("app_debug.log", "a") as f:
                             f.write(f"\n[TEMPLATE DEBUG] Config Keys: {list(config.keys())}\n")
                             f.write(f"[TEMPLATE DEBUG] Additional Instr: {config.get('additionalInstructions')[:50] if config.get('additionalInstructions') else 'None'}\n")
                    except: pass

                    # Map config to instructions
                    focus = config.get("focus") or config.get("entitiesOfInterest") or "General content"
                    exclude = config.get("exclude")
                    additional_instr = config.get("additionalInstructions")
                    
                    mode = "default"
                    extraction_instructions = ExtractionInstructions(
                        focus=focus,
                        exclude=exclude,
                        additional_instructions=additional_instr,
                        mode=mode
                    )
                    
                    # Resolve Additional Assets (defined in Template Config)
                    source_ids = config.get("sourceSections", [])
                    print(f"[SmartTemplate] Fallback checking sourceSections: {source_ids}")
                    if source_ids:
                           # CanvasThing is already globally imported
                           # FIX: Ensure we ONLY pick up sourceSections if they belong to THIS canvas.
                           # This prevents the template from running on "Ghost" documents from other canvases.
                           extra_things = db.query(CanvasThing).filter(
                               CanvasThing.id.in_(source_ids),
                               CanvasThing.canvas_id == request.canvas_id 
                           ).all()
                           print(f"[SmartTemplate] Found {len(extra_things)} things in DB for sourceSections")
                           for t in extra_things:
                               if any(a.id == t.id for a in assets):
                                   print(f"[SmartTemplate] Skipping duplicate asset {t.id}")
                                   continue
                               content_summary = await self._resolve_thing_content(db, t)
                               print(f"[SmartTemplate] Resolved content for {t.id}: Len {len(str(content_summary))}")
                               if content_summary:
                                   assets.append(AssetRef(
                                      id=t.id,
                                      type=t.type.value,
                                      url=None,
                                      content=content_summary
                                   ))

                            
                    # Final Fallback: If still no assets, use ALL valid things on the canvas
                    if not assets:
                        print("[SmartTemplate] No selection and no sourceSections. Fallback: Loading ALL things from canvas.")
                        try:
                             all_things = db.query(CanvasThing).filter(
                                 CanvasThing.canvas_id == request.canvas_id, 
                                 CanvasThing.type.in_([ThingType.DOCUMENT, ThingType.TEXT, ThingType.URL])
                             ).limit(5).all()
                             
                             for t in all_things:
                                 content_summary = await self._resolve_thing_content(db, t)
                                 if content_summary:
                                     assets.append(AssetRef(
                                        id=t.id,
                                        type=t.type.value,
                                        url=None,
                                        content=content_summary
                                     ))
                             print(f"[SmartTemplate] Loaded {len(assets)} fallback assets from canvas.")
                        except Exception as e:
                            print(f"[SmartTemplate] Default Canvas Fallback failed: {e}")

                    break
             
        extractor_input = ExtractorInput(
            assets=assets,
            extraction_instructions=extraction_instructions
        )
             
        inputs = {
            "extractor_input": extractor_input.dict(), # STRICT INPUT
            "selection": entities_data,
            "combined_context": combined_context, # Fallback
            "canvas_id": request.canvas_id,
            "model": request.model
        }
        
        # Debug Logging to File
        try:
            with open("c:/Users/opole/.gemini/antigravity/brain/5682f1e1-88d7-441b-9713-8db9f498f08a/backend_debug.txt", "a") as f:
                f.write(f"\n[STREAM] {datetime.utcnow()} - Request Model: '{request.model}' (Type: {type(request.model)})\n")
                f.write(f"[STREAM] Inputs Model: '{inputs.get('model')}'\n")
        except Exception as e:
            print(f"Log Error: {e}")
            
        print(f"[SmartTemplate] Request Model: {request.model}")
        print(f"[SmartTemplate] Inputs Model: {inputs.get('model')}")
        
        # 4. Execute
        pipeline_config_to_use = template.pipeline_config
        
        # --- DOCUMENT TEMPLATE EXECUTION (Deterministic Processing) ---
        if template.document_template_id:
            print(f"[SmartTemplate] Document Template Mode (DocTemplateID: {template.document_template_id})")
            from app.services.document_template_service import document_template_service
            from app.models.template import Template as DocTemplate
            
            # 1. Fetch Document Template
            doc_template = db.query(DocTemplate).filter(DocTemplate.id == template.document_template_id).first()
            if doc_template and doc_template.structure:
                structure = doc_template.structure
                
                print(f"[SmartTemplate] Executing deterministic template processing...")
                print(f"[SmartTemplate] Blocks: {len(structure.get('blocks', []))}")
                
                # 2. Build context for template execution
                doc_context = {
                    **inputs,
                    "combined_context": combined_context,
                    "entities": entities_data,
                    "_model": request.model,
                }
                
                # 3. Extract execution config
                exec_config = structure.get("execution_config", {})
                template_purpose = structure.get("purpose", "")
                max_iter = int(exec_config.get("max_iterations", 1))
                min_q = int(exec_config.get("min_quality", 0))
                level_of_detail = exec_config.get("level_of_detail", "standard")
                
                # 4. Execute deterministic template processing
                yield {"type": "log", "content": f"Processing Document Template: {doc_template.name}"}
                yield {"type": "node_start", "data": {"node": {"id": "doc_template", "label": "Generating Document Content"}}}
                
                try:
                    # Execute with progress updates via queue
                    import asyncio
                    
                    # Progress queue to receive section names from callback
                    progress_queue: asyncio.Queue = asyncio.Queue()
                    current_section = "Initializing..."
                    
                    # Callback to put section names in queue
                    async def progress_callback(section_title: str):
                        await progress_queue.put(section_title)
                    
                    # Create task for document generation with callback
                    gen_task = asyncio.create_task(
                        document_template_service.execute(
                            structure=structure,
                            context=doc_context,
                            execution_config=exec_config,
                            progress_callback=progress_callback
                        )
                    )
                    
                    # Progress loop - yield section updates and heartbeats
                    heartbeat_count = 0
                    while not gen_task.done():
                        # Wait for either: task done, queue item, or timeout
                        try:
                            # Check for new section (non-blocking with short timeout)
                            section = await asyncio.wait_for(
                                progress_queue.get(), timeout=0.1
                            )
                            current_section = section
                            yield {"type": "log", "content": f"Processing: {current_section}"}
                            print(f"[SmartTemplate] Processing section: {current_section}")
                        except asyncio.TimeoutError:
                            pass
                        
                        # Heartbeat every 5 seconds
                        heartbeat_count += 1
                        if heartbeat_count % 50 == 0:  # Every 5 seconds (50 * 0.1s)
                            elapsed = heartbeat_count // 10
                            yield {"type": "log", "content": f"Processing: {current_section} ({elapsed}s)"}
                    
                    # Get result
                    final_document, execution_log = await gen_task
                    
                    print(f"[SmartTemplate] Document generated: {len(final_document)} chars")
                    yield {"type": "log", "content": f"Document generated ({len(final_document)} characters)"}
                    yield {"type": "node_end", "data": {"node": {"id": "doc_template", "label": "Generating Document Content"}}}
                    
                    # --- Save debug output ---
                    try:
                        debug_dir = "C:/Users/opole/Downloads/ChatBotn/backend/debug_docs"
                        import os
                        os.makedirs(debug_dir, exist_ok=True)
                        with open(f"{debug_dir}/00_INITIAL_DOCUMENT.md", "w", encoding="utf-8") as f:
                            f.write(f"# INITIAL DOCUMENT (Deterministic Processing)\n")
                            f.write(f"# Template: {template.name}\n")
                            f.write(f"# Length: {len(final_document)} chars\n")
                            f.write(f"# Timestamp: {datetime.utcnow()}\n\n")
                            f.write("---\n\n")
                            f.write(final_document)
                    except Exception as e:
                        print(f"[SmartTemplate] DEBUG: Failed to save initial doc: {e}")
                    
                    # --- Build structured execution plan for Agent Analysis display ---
                    execution_plan = [
                        {
                            "id": "initial_gen",
                            "label": f"Initial Draft ({len(final_document)} chars)",
                            "type": "GENERATOR",
                            "status": "completed",
                            "details": f"Generated initial deterministic document structure via template: {template.name}"
                        }
                    ]
                    print(f"Cycle Step: Initial Gen | Details: Generated initial draft ({len(final_document)} chars)")
                    
                    # Yield initial plan immediately
                    yield {"type": "plan_update", "plan": execution_plan}
                    
                    # Reviews each section independently and refines only weak sections
                    if min_q > 0 and final_document and max_iter > 0:
                        print(f"[SmartTemplate] Starting Section-Level Refinement. Target: {min_q}%, Max Iterations: {max_iter}")
                        yield {"type": "log", "content": f"Starting Section Review (Target: {min_q}%)"}
                        
                        candidate_content = final_document
                        
                        try:
                            for iteration in range(1, max_iter + 1):
                                cycle_node = {
                                    "id": f"cycle_{iteration}",
                                    "label": f"Cycle {iteration}: Section Review",
                                    "type": "CYCLE",
                                    "status": "active",
                                    "children": []
                                }
                                execution_plan.append(cycle_node)
                                print(f"Cycle Step: Cycle {iteration} Started | Details: Starting section-level review cycle")
                                
                                # Initial yield for the cycle node
                                yield {"type": "plan_update", "plan": execution_plan}
                                
                                yield {"type": "node_start", "data": {"node": {"id": "section_review", "label": f"Section Review Cycle {iteration}/{max_iter}"}}}
                                print(f"[SmartTemplate] Section Review Cycle {iteration}")
                                
                                # Extract sections from document
                                sections = self._extract_sections(candidate_content)
                                
                                if not sections:
                                    print(f"[SmartTemplate] No sections found in document")
                                    yield {"type": "log", "content": "No sections found - skipping refinement"}
                                    break
                                
                                yield {"type": "log", "content": f"Cycle {iteration}: Found {len(sections)} sections"}
                                
                                # HYBRID APPROACH: Single LLM call to review ENTIRE document
                                yield {"type": "log", "content": f"Reviewing entire document..."}
                                
                                import asyncio
                                review_task = asyncio.create_task(
                                    self._review_document_with_sections(
                                        candidate_content,
                                        sections,
                                        template_purpose,
                                        request.model,
                                        min_q
                                    )
                                )
                                
                                # Heartbeat while reviewing
                                while not review_task.done():
                                    done, _ = await asyncio.wait([review_task], timeout=5.0)
                                    if review_task in done:
                                        break
                                    yield {"type": "log", "content": "  Still reviewing document..."}
                                
                                review_result = await review_task
                                
                                # Process results from hybrid review
                                section_results = review_result.get("sections", [])
                                weak_sections = []
                                
                                # Add AUDITOR node for the single review call
                                cycle_node["children"].append({
                                    "id": f"review_{iteration}_hybrid",
                                    "label": f"Document Review Overview",
                                    "type": "AUDITOR",
                                    "status": "completed",
                                    "details": {
                                        "Quality Score": review_result['overall_score'],
                                        "Overall Feedback": review_result['overall_feedback'],
                                        "metrics": review_result.get('metrics', {})
                                    }
                                })
                                print(f"Cycle Step: Global Auditor | Details: Score: {review_result['overall_score']} | Feedback: {review_result['overall_feedback'][:100]}...")
                                
                                # Log per-section scores and identify weak sections
                                for result in section_results:
                                    status_icon = "✓" if result['score'] >= min_q else "✗"
                                    
                                    # Create per-section AUDITOR node (Restored Feature)
                                    status_str = "pass" if result['score'] >= min_q else "fail"
                                    issues_list = result.get('issues', [])
                                    
                                    cycle_node["children"].append({
                                        "id": f"review_{iteration}_{result['title']}",
                                        "label": f"Review: {result['title']}",
                                        "type": "AUDITOR",
                                        "status": "completed",
                                        "details": {
                                            "Quality Score": result['score'],
                                            "Feedback": result.get('feedback', 'No feedback'),
                                            "Issues": issues_list if issues_list else "None"
                                        }
                                    })
                                    print(f"Cycle Step: Section Auditor [{result['title']}] | Details: Score: {result['score']} | Issues: {len(issues_list) if isinstance(issues_list, list) else 0}")
                                    
                                    yield {
                                        "type": "section_score",
                                        "section": result['title'],
                                        "score": result['score'],
                                        "status": status_str
                                    }
                                    yield {"type": "log", "content": f"  {status_icon} {result['title'][:30]}: {result['score']}/100"}
                                    
                                    if result['score'] < min_q:
                                        weak_sections.append(result)

                                # Push updated plan with children to frontend
                                yield {"type": "plan_update", "plan": execution_plan}
                                
                                # Calculate overall score
                                avg_score = sum(r['score'] for r in section_results) / len(section_results) if section_results else review_result['overall_score']
                                print(f"[SmartTemplate] Cycle {iteration}: {len(weak_sections)} weak sections, avg score {avg_score:.0f}")
                                
                                yield {"type": "log", "content": f"Average Score: {avg_score:.0f}/100 ({len(weak_sections)} sections need work)"}
                                
                                # Mark cycle as completed for this iteration
                                cycle_node["status"] = "completed"
                                yield {"type": "plan_update", "plan": execution_plan}
                                
                                # Check if all sections pass
                                if not weak_sections:
                                    yield {"type": "log", "content": "✓ All sections meet quality target!"}
                                    break
                                
                                # Refine weak sections
                                yield {"type": "log", "content": f"Refining {len(weak_sections)} weak sections..."}
                                
                                for weak in weak_sections:
                                    yield {"type": "refining_section", "section": weak['title'], "iteration": iteration}
                                    yield {"type": "log", "content": f"Refining: {weak['title'][:40]}..."}
                                    
                                    try:
                                        refine_task = asyncio.create_task(
                                            self._refine_section(weak, template_purpose, request.model)
                                        )
                                        
                                        while not refine_task.done():
                                            done, _ = await asyncio.wait([refine_task], timeout=5.0)
                                            if refine_task in done:
                                                break
                                            yield {"type": "log", "content": f"  Still refining {weak['title'][:30]}..."}
                                        
                                        refine_result = await refine_task
                                        new_content = refine_result['content']
                                        thinking = refine_result.get('thinking', 'Focused on fixing identified quality issues.')
                                        
                                        # Replace section in document
                                        candidate_content = self._replace_section_in_document(
                                            candidate_content, weak, new_content
                                        )
                                        yield {"type": "log", "content": f"  ✓ Refined: {weak['title'][:40]}"}
                                        
                                        # Add to cycle node
                                        cycle_node["children"].append({
                                            "id": f"refine_{iteration}_{weak['title']}",
                                            "label": f"Refine: {weak['title']}",
                                            "type": "EDITOR",
                                            "status": "completed",
                                            "details": f"**Refinement Reasoning:**\n\n{thinking}"
                                        })
                                        print(f"Cycle Step: Section Editor [{weak['title']}] | Details: Reasoning: {thinking[:100]}...")
                                        
                                    except Exception as e:
                                        print(f"[SmartTemplate] Section refine failed for '{weak['title']}': {e}")
                                        yield {"type": "log", "content": f"  ✗ Failed to refine: {weak['title'][:30]}"}
                                
                                yield {"type": "node_end", "data": {"node": {"id": "section_review", "label": f"Section Review Cycle {iteration}/{max_iter}"}}}
                            
                            # Use refined content
                            final_document = candidate_content
                            yield {"type": "log", "content": "Section-level refinement complete"}
                        except Exception as e:
                            print(f"[SmartTemplate] Critical Refinement Error: {e}")
                            import traceback
                            traceback.print_exc()
                            yield {"type": "log", "content": f"Refinement process interrupted: {e}"}
                    
                    # --- PERSIST RESULT ---
                    # Update source thing status
                    if things:
                        try:
                            # Re-fetch target_thing to avoid StaleDataError in long-running streaming session
                            target_thing = db.query(CanvasThing).filter(CanvasThing.id == things[0].id).first()
                            if target_thing:
                                db.refresh(target_thing)
                                existing_content = target_thing.content or {}
                                existing_content["analysis_result"] = final_document
                                existing_content["processing_status"] = "Analysis Complete"
                                # Ensure execution_plan is also persisted
                                existing_content["execution_plan"] = execution_plan
                                
                                target_thing.content = existing_content
                                target_thing.rag_status = "completed"
                                
                                from sqlalchemy.orm.attributes import flag_modified
                                flag_modified(target_thing, "content")
                                
                                db.add(target_thing)
                                db.commit()
                                print(f"Cycle Step: Final Result Persisted | Details: Saved result and execution plan to {target_thing.id}")
                            else:
                                print(f"[SmartTemplate] Persist Error: Target thing {things[0].id} disappeared from DB")
                        except Exception as e:
                            print(f"[SmartTemplate] Persist Error: {e}")
                    
                    # --- CREATE OUTPUT THING ---
                    new_thing = None
                    try:
                        import uuid
                        
                        # Calculate position for new thing (offset from source)
                        source_thing = things[0] if things else None
                        new_x = (source_thing.position_x + 350) if source_thing else 100
                        new_y = source_thing.position_y if source_thing else 100
                        
                        # Use source thing's canvas_id (NOT request.canvas_id which may be stale)
                        target_canvas_id = source_thing.canvas_id if source_thing else request.canvas_id
                        
                        # DEBUG: Compare request canvas vs source thing canvas
                        if source_thing and source_thing.canvas_id != request.canvas_id:
                            print(f"[SmartTemplate] WARNING: Canvas mismatch! request.canvas_id={request.canvas_id} != source_thing.canvas_id={source_thing.canvas_id}")
                        print(f"[SmartTemplate] Creating output on canvas {target_canvas_id} (source thing canvas)")
                        
                        # Create new document thing with the markdown result
                        new_thing = CanvasThing(
                            id=str(uuid.uuid4()),
                            canvas_id=target_canvas_id,
                            type="document",  # Document type for markdown rendering
                            title=f"{template.name} - Result",
                            content={
                                "content": final_document,  # 'content' key for documents
                                "format": "markdown",
                                "generated_from": template.name,
                                "source_thing_id": source_thing.id if source_thing else None,
                                "execution_plan": {
                                    "templateName": f"{template.name} - Deep Agent Plan",
                                    "nodes": execution_plan
                                }
                            },
                            position_x=new_x,
                            position_y=new_y,
                            width=400,
                            height=300,
                            z_index=100
                        )
                        db.add(new_thing)
                        db.commit()
                        db.refresh(new_thing)
                        
                        print(f"[SmartTemplate] Created output thing {new_thing.id}")
                        
                        # IMMEDIATELY notify frontend of new node (don't wait for links)
                        print(f"[SmartTemplate] YIELDING node_created event for {new_thing.id}")
                        yield {
                            "type": "node_created",
                            "node": {
                                "id": new_thing.id,
                                "canvas_id": new_thing.canvas_id,
                                "type": new_thing.type,
                                "title": new_thing.title,
                                "content": new_thing.content,
                                "position_x": new_thing.position_x,
                                "position_y": new_thing.position_y,
                                "width": new_thing.width,
                                "height": new_thing.height,
                                "z_index": new_thing.z_index
                            },
                            "links": []  # Links will come separately
                        }
                        
                    except Exception as e:
                        print(f"[SmartTemplate] Failed to create output thing: {e}")
                        import traceback
                        traceback.print_exc()
                    
                    # --- CREATE LINKS TO ALL SOURCE THINGS (separate step, uses fallback on failure) ---
                    if new_thing:
                        created_links = []
                        try:
                            # Use simple fallback link - skip AI to avoid blocking
                            for source_thing in things:
                                source_summary = source_thing.title or "Source Document"
                                link = CanvasLink(
                                    id=str(uuid.uuid4()),
                                    canvas_id=target_canvas_id,  # Use same canvas as output node
                                    source_id=source_thing.id,
                                    target_id=new_thing.id,
                                    type="derived_from",
                                    label="Generated from",
                                    description=f"Analysis result generated from '{source_summary}' using template '{template.name}'"
                                )
                                db.add(link)
                                created_links.append({
                                    "id": link.id,
                                    "canvas_id": link.canvas_id,
                                    "source_id": link.source_id,
                                    "target_id": link.target_id,
                                    "type": link.type,
                                    "label": link.label,
                                    "description": link.description
                                })
                            
                            if created_links:
                                db.commit()
                                print(f"[SmartTemplate] Created {len(created_links)} links from result to sources")
                                
                                # Send links as separate event
                                yield {
                                    "type": "links_created",
                                    "links": created_links
                                }
                        except Exception as link_err:
                            print(f"[SmartTemplate] Link creation error: {link_err}")
                    
                    # Yield completion event
                    yield {
                        "type": "complete",
                        "data": {
                            "status": "completed",  # Required by frontend
                            "final_document": final_document,
                            "execution_log": execution_log,
                            "success": True
                        }
                    }
                    return  # Document Template flow complete
                    
                except Exception as e:
                    print(f"[SmartTemplate] Document Template Error: {e}")
                    import traceback
                    traceback.print_exc()
                    yield {"type": "error", "content": f"Template execution failed: {e}"}
                    return
            else:
                print(f"[SmartTemplate] WARNING: Document Template ID {template.document_template_id} not found or has no structure.")

        blueprint_mock = {
            "graph": pipeline_config_to_use,
            "id": template.id
        }
        

        blueprint_mock = {
            "graph": pipeline_config_to_use,
            "id": template.id
        }
        
        # Pre-compute Node Label Map for UI Injection
        node_label_map = {}
        if pipeline_config_to_use and "nodes" in pipeline_config_to_use:
             for n in pipeline_config_to_use["nodes"]:
                  node_label_map[n["id"]] = n.get("label", n.get("id"))

        runtime = AgentRuntime(blueprint_mock, db)


        print(f"[SmartTemplate] Streaming execution for '{template.name}' with {len(entities_data)} items.")
        
        try:
            async for event in runtime.execute_stream(inputs):
                # --- EVENT INJECTION FOR UI ---
                # Force correct label for Frontend Toast
                if event["type"] == "step_start" and "step" in event:
                      step_id = event["step"].get("id")
                      if step_id and step_id in node_label_map:
                           event["step"]["node_label"] = node_label_map[step_id]

                # Patch logs that might be using ID as label
                if event["type"] == "log" and "node_label" in event:
                      raw_lbl = event["node_label"]
                      # If the label is actually a known ID, replace it
                      if raw_lbl in node_label_map:
                           event["node_label"] = node_label_map[raw_lbl]
                # ------------------------------

                # --- DYNAMIC STATUS UPDATE ---
                if event["type"] == "node_start" and things:
                    try:
                        n_data = event.get("data", {}).get("node", {})
                        node_id = n_data.get("id") # FIX: Extract ID properly
                        
                        # Format friendly message
                        # Try to get friendly label from map first, then node data, then fall back to "Section"
                        n_lbl = ""
                        if node_id and node_id in node_label_map:
                             n_lbl = node_label_map[node_id]
                        elif "label" in n_data:
                             n_lbl = n_data["label"]
                        
                        if not n_lbl:
                             n_lbl = "Section"

                        if n_lbl.startswith("Generate "):
                             n_lbl = n_lbl.replace("Generate ", "", 1)
                        
                        status_msg = f"Processing section: {n_lbl}"
                        
                        # Update Input Thing
                        # Use separate transaction or careful commit to avoid loop lag?
                        # Using main db session is fine for low frequency updates.
                        target_t = things[0]
                        
                        # Force update of JSON content
                        if target_t.content:
                            new_c = dict(target_t.content)
                            new_c["processing_status"] = status_msg
                            target_t.content = new_c
                            target_t.rag_status = "processing" # Ensure overlay is active
                            db.add(target_t)
                            db.commit()
                    except Exception as e:
                        print(f"[SmartTemplate] Status Update Warning: {e}")
                # -----------------------------

                # CRITICAL FIX: Do NOT yield 'complete' event immediately.
                # We need to run the Iterative Loop (Auditor) first, which might update the result.
                # We will yield the updated 'complete' event at the very end of this block.
                if event["type"] != "complete":
                    yield event
                
                # Handle completion - Persist Result
                if event["type"] == "complete":
                    final_result = event.get("data", {})
                    outputs = final_result.get("outputs", {})
                    state_vars = final_result.get("execution_state", {})
                    full_state = final_result.get("full_state", {})
                    
                    # Fix: current_output is in full_state, not variables (execution_state)
                    current_output = full_state.get("current_output")
                    
                    # --- ITERATIVE REFINEMENT ENGINE (Phase 2 & 3) ---
                    # Check for Execution Config
                    exec_config = {}
                    template_purpose = ""
                    
                    # Resolve 'structure' source (linked Document Template or fallback to self)
                    structure_source = template.pipeline_config # Default
                    if hasattr(template, "document_template_id") and template.document_template_id:
                         from app.models.template import Template as DocTemplate
                         doc_t = db.query(DocTemplate).filter(DocTemplate.id == template.document_template_id).first()
                         if doc_t and doc_t.structure:
                             structure_source = doc_t.structure
                    
                    if structure_source and isinstance(structure_source, dict):
                         exec_config = structure_source.get("execution_config", {})
                         template_purpose = structure_source.get("purpose", "")
                    
                    max_iter = int(exec_config.get("max_iterations", 1))
                    min_q = int(exec_config.get("min_quality", 0))
                    level_of_detail = exec_config.get("level_of_detail", "standard")
                    
                    if min_q > 0:
                        # 1. Extract Candidate Content for Review
                        # Try variables first, then current_output
                        variables = full_state.get("variables", {})
                        candidate_content = (
                            variables.get("final_document") or 
                            variables.get("audited_document") or 
                            variables.get("compiled_draft")
                        )
                        
                        if not candidate_content and isinstance(current_output, dict):
                             candidate_content = current_output.get("generated_markdown") or current_output.get("text")
                             
                        if candidate_content and isinstance(candidate_content, str):
                            print(f"[SmartTemplate] Starting Iterative Loop. Target: {min_q}%, Max: {max_iter}")
                            yield {"type": "log", "content": f"Starting Review Cycles (Target Quality: {min_q}%, Max Cycles: {max_iter})"}
                            
                            # DEBUG: Save initial document (before any refinement) to file
                            try:
                                debug_dir = "C:/Users/opole/Downloads/ChatBotn/backend/debug_docs"
                                import os
                                os.makedirs(debug_dir, exist_ok=True)
                                with open(f"{debug_dir}/00_INITIAL_DOCUMENT.md", "w", encoding="utf-8") as f:
                                    f.write(f"# INITIAL DOCUMENT (Before Refinement)\n")
                                    f.write(f"# Template: {template.name}\n")
                                    f.write(f"# Length: {len(candidate_content)} chars\n")
                                    f.write(f"# Timestamp: {datetime.utcnow()}\n\n")
                                    f.write("---\n\n")
                                    f.write(candidate_content)
                                print(f"[SmartTemplate] DEBUG: Saved initial document to {debug_dir}/00_INITIAL_DOCUMENT.md")
                            except Exception as e:
                                print(f"[SmartTemplate] DEBUG: Failed to save initial doc: {e}")
                            
                            current_q = 0
                            iteration = 0
                            score = 0
                            iterative_steps = []
                            
                            while iteration < max_iter:
                                iteration += 1
                                
                                # DEBUG: Save document before this cycle
                                try:
                                    with open(f"{debug_dir}/{iteration:02d}_BEFORE_CYCLE.md", "w", encoding="utf-8") as f:
                                        f.write(f"# DOCUMENT BEFORE CYCLE {iteration}\n")
                                        f.write(f"# Length: {len(candidate_content)} chars\n\n")
                                        f.write("---\n\n")
                                        f.write(candidate_content)
                                    print(f"[SmartTemplate] DEBUG: Saved document before cycle {iteration}")
                                except Exception as e:
                                    print(f"[SmartTemplate] DEBUG: Failed to save cycle doc: {e}")
                                # Track Cycle Node
                                cycle_step = {
                                    "id": f"cycle_{iteration}",
                                    "type": "ITERATION_CYCLE", 
                                    "label": f"Review Cycle {iteration}",
                                    "status": "active",
                                    "children": []
                                }
                                
                                yield {"type": "node_start", "data": {"node": {"id": "review_step", "label": f"Review Cycle {iteration}/{max_iter}"}}}
                                
                                # 1. Update UI Status: Auditing
                                if things:
                                    try:
                                        t_upd = things[0]
                                        if t_upd.content:
                                            c = dict(t_upd.content)
                                            c["processing_status"] = f"Cycle {iteration}: Auditing Draft..."
                                            t_upd.content = c
                                            db.add(t_upd)
                                            db.commit()
                                    except Exception: pass

                                # 2. Audit with Keep-Alive
                                try:
                                    import asyncio
                                    audit_task = asyncio.create_task(self._review_document(candidate_content, template_purpose, request.model, level_of_detail=level_of_detail, cycle_index=iteration))
                                    
                                    while not audit_task.done():
                                        done, _ = await asyncio.wait([audit_task], timeout=5.0)
                                        if audit_task in done: break
                                        yield {"type": "log", "content": f"Auditing Document (Cycle {iteration})..."}
                                    
                                    score, feedback, metrics = await audit_task
                                except (asyncio.CancelledError, Exception) as audit_err:
                                     print(f"[SmartTemplate] Audit Interrupted/Failed: {audit_err}")
                                     yield {"type": "log", "content": f"Audit interrupted: {audit_err}. Stopping loop."}
                                     break # Exit loop and persist whatever we have
                                print(f"[SmartTemplate] Cycle {iteration}: Score {score}")
                                yield {"type": "log", "content": f"Review Cycle {iteration}: Quality Score {score}/100"}
                                
                                # Record Audit Step
                                audit_step = {
                                    "id": f"audit_{iteration}",
                                    "type": "AUDITOR",
                                    "label": f"Quality Check (Score: {score})",
                                    "status": "completed",
                                    "details": feedback, # Pass struct/string
                                    "output": {"score": score}
                                }
                                cycle_step["children"].append(audit_step)
                                
                                # Set Cycle Summary Details
                                metrics = metrics or {}
                                cycle_details = {
                                    "Quality Score": f"{score}/100",
                                    "Status": "Target Met" if score >= min_q else "Refining...",
                                    "Auditor Analysis": feedback,
                                    "Purpose Match": f"{metrics.get('purpose_match', 0)}/100",
                                    "Structure Match": f"{metrics.get('structure_match', 0)}/100",
                                    "Instruction Match": f"{metrics.get('instruction_match', 0)}/100",
                                    "Styling Match": f"{metrics.get('styling_match', 0)}/100"
                                }
                                cycle_step["details"] = cycle_details
                                
                                if score >= min_q:
                                    yield {"type": "log", "content": "Quality Target Met. Finalizing..."}
                                    cycle_step["status"] = "completed"
                                    # Details already set above
                                    iterative_steps.append(cycle_step)
                                    break
                                    
                                # 3. Refine
                                if iteration < max_iter:
                                    # Debug Log
                                    yield {"type": "log", "content": f"Score {score} < {min_q}. Proceeding to Refinment ({iteration}/{max_iter})..."}
                                    yield {"type": "node_start", "data": {"node": {"id": "refine_step", "label": f"Refining Draft ({iteration})"}}}
                                    
                                    # Update UI Status: Refining
                                    if things:
                                        try:
                                            t_upd = things[0]
                                            if t_upd.content:
                                                c = dict(t_upd.content)
                                                c["processing_status"] = f"Cycle {iteration}: Refining Document (Score: {score})..."
                                                t_upd.content = c
                                                db.add(t_upd)
                                                db.commit()
                                        except Exception: pass

                                    # Safe Call with Keep-Alive Loop (Fixes Starlette Timeout)
                                    try:
                                        import asyncio
                                        
                                        # Create Background Task
                                        refine_task = asyncio.create_task(self._refine_document(candidate_content, template_purpose, feedback, request.model, level_of_detail=level_of_detail, cycle_index=iteration))
                                        
                                        # Monitor Task and Yield Heartbeats
                                        heartbeat_count = 0
                                        while not refine_task.done():
                                            # Wait 5 seconds or until task is done
                                            done, pending = await asyncio.wait([refine_task], timeout=5.0)
                                            
                                            if refine_task in done:
                                                break # Task finished
                                            
                                            # Yield Heartbeat/Progress
                                            heartbeat_count += 5
                                            yield {"type": "log", "content": f"Refining Document (Cycle {iteration}): {heartbeat_count}s elapsed..."}
                                        
                                        # Get Result
                                        candidate_content = await refine_task
                                        
                                        # Validate Result
                                        if not candidate_content:
                                            print(f"[SmartTemplate] WARNING: Refinement returned empty content.")
                                            candidate_content = "" # Ensure string
                                        
                                        # DEBUG: Save document after this refinement cycle
                                        try:
                                            with open(f"{debug_dir}/{iteration:02d}_AFTER_REFINEMENT.md", "w", encoding="utf-8") as f:
                                                f.write(f"# DOCUMENT AFTER CYCLE {iteration} REFINEMENT\n")
                                                f.write(f"# Length: {len(candidate_content)} chars\n\n")
                                                f.write("---\n\n")
                                                f.write(candidate_content)
                                            print(f"[SmartTemplate] DEBUG: Saved document after cycle {iteration} refinement")
                                        except Exception as e:
                                            print(f"[SmartTemplate] DEBUG: Failed to save refined doc: {e}")
                                            
                                    except (asyncio.CancelledError, Exception) as refine_err:
                                        # Catch Cancellation or other errors to ensure we persist partial results
                                        print(f"[SmartTemplate] Refinement Interrupted/Failed: {refine_err}")
                                        yield {"type": "log", "content": f"Refinement interrupted: {refine_err}. Saving current draft..."}
                                        
                                        # Save state and exit loop
                                        cycle_details["Status"] = f"Interrupted"
                                        cycle_step["details"] = cycle_details
                                        iterative_steps.append(cycle_step)
                                        
                                        # Force break to reach persistence logic
                                        break

                                    
                                    # Record Refine Step
                                    refine_step = {
                                        "id": f"refine_{iteration}",
                                        "type": "EDITOR",
                                        "label": "Content Refinement",
                                        "status": "completed",
                                        "details": "Refined document content based on audit feedback."
                                    }
                                    cycle_step["children"].append(refine_step)
                                    cycle_step["status"] = "completed"
                                    
                                    # Update Status for closure
                                    cycle_details["Status"] = "Refinement Complete"
                                    cycle_step["details"] = cycle_details
                                    
                                    iterative_steps.append(cycle_step)
                                    
                                    # Update State with Refined Content
                                    if "variables" not in full_state: full_state["variables"] = {}
                                    full_state["variables"]["final_document"] = candidate_content
                                    full_state["variables"]["audited_document"] = candidate_content
                                    
                                    if isinstance(current_output, dict):
                                        current_output["generated_markdown"] = candidate_content
                                        current_output["text"] = candidate_content
                                        full_state["current_output"] = current_output
                                    else:
                                        full_state["current_output"] = candidate_content
                                        current_output = candidate_content
                                else:
                                    # Max iterations reached
                                    cycle_step["status"] = "completed" 
                                    cycle_step["details"] = "Max Iterations Reached"
                                    iterative_steps.append(cycle_step)
                            
                            # Final State Update (Persistence)
                            if "variables" not in full_state: full_state["variables"] = {}
                            full_state["variables"]["final_document"] = candidate_content
                            full_state["variables"]["audited_document"] = candidate_content
                            if isinstance(current_output, dict):
                                current_output["generated_markdown"] = candidate_content
                                current_output["text"] = candidate_content
                            else:
                                current_output = candidate_content
                                full_state["current_output"] = candidate_content
                            
                            # DEBUG: Save final document after all cycles
                            try:
                                with open(f"{debug_dir}/99_FINAL_DOCUMENT.md", "w", encoding="utf-8") as f:
                                    f.write(f"# FINAL DOCUMENT (After All Cycles)\n")
                                    f.write(f"# Template: {template.name}\n")
                                    f.write(f"# Length: {len(candidate_content)} chars\n")
                                    f.write(f"# Total Cycles: {iteration}\n\n")
                                    f.write("---\n\n")
                                    f.write(candidate_content)
                                print(f"[SmartTemplate] DEBUG: Saved final document to {debug_dir}/99_FINAL_DOCUMENT.md")
                            except Exception as e:
                                print(f"[SmartTemplate] DEBUG: Failed to save final doc: {e}")
                                
                            # Inject Iterative Plan into Full State for retrieval below
                            full_state["iterative_plan"] = iterative_steps

                    
                    print(f"[SmartTemplate] DEBUG: current_output type: {type(current_output)}")
                    if isinstance(current_output, dict):
                        print(f"[SmartTemplate] DEBUG: current_output keys: {list(current_output.keys())}")

                        if "generated_markdown" in current_output:
                            print(f"[SmartTemplate] DEBUG: generated_markdown length: {len(current_output['generated_markdown'])}")
                            print(f"[SmartTemplate] DEBUG: generated_markdown snippet: {str(current_output['generated_markdown'])[:50]}...")
                        if "_raw" in current_output:
                            print(f"[SmartTemplate] DEBUG: _raw length: {len(str(current_output['_raw']))}")
                    else:
                        print(f"[SmartTemplate] DEBUG: current_output value: {str(current_output)[:100]}")
                    
                    # Log Runtime Error if present
                    runtime_error = final_result.get("error") or full_state.get("error")
                    if runtime_error:
                         print(f"[SmartTemplate] CRITICAL RUNTIME ERROR: {runtime_error}")
                         # If there was an error, we can't expect output. 
                         # But we should still try to produce a fallback node if possible? Or just let it fail?
                         # The current logic will produce an empty node. 



                    # 1. Identify the *actual* final node (last executed step)
                    target_node_id = full_state.get("last_executed_node") or full_state.get("current_node")
                    
                    # Initialize result variables
                    thing_type = ThingType.TEXT
                    thing_content = {"text": "", "markdown": ""}
                    thing_title = f"Analysis: {template.name}"
                    
                    # Initialize default params to avoid UnboundLocalError
                    current_node_params = {}

                    # --- DEEP ANALYSIS RESULT HANDLING ---
                    if template.document_template_id:
                        print(f"[SmartTemplate] Processing Deep Analysis Result for DocTemplate: {template.document_template_id}")
                        
                        # 1. Extract Generated Content
                        generated_content = ""
                        
                        # Check deep analysis variables first (Auditor > Refiner > Compiler)
                        variables = full_state.get("variables", {})
                        
                        # Helper to extract content safely
                        def _get_var_content(v_name, key):
                            val = variables.get(v_name)
                            if not val: return None
                            if isinstance(val, dict):
                                return val.get(key) or val.get("text") or val.get("content") or str(val)
                            return str(val)

                        if "audited_document" in variables:
                               generated_content = _get_var_content("audited_document", "audited_document")
                               print("[SmartTemplate] Using AUDITED document result.")
                        elif "final_document" in variables:
                             generated_content = _get_var_content("final_document", "final_document")
                             print("[SmartTemplate] Using FINAL document result.")
                        elif "compiled_draft" in variables:
                             generated_content = _get_var_content("compiled_draft", "compiled_draft")

                        # Fallback to standard output keys if not found
                        if not generated_content:
                            if isinstance(current_output, dict):
                                # Try standard keys first
                                generated_content = (
                                    current_output.get("generated_markdown") or 
                                    current_output.get("text") or 
                                    current_output.get("content") or 
                                    current_output.get("result") or
                                    str(current_output)
                                )
                            else:
                                generated_content = str(current_output)
                        
                        # 2. Enrich Content with Execution Plan
                        # FE expects 'execution_plan' in content to show Green Brain
                        # Runtime returns 'steps' in the final result object
                        execution_plan = final_result.get("steps") or full_state.get("execution_plan") or []
                        if isinstance(execution_plan, set):
                            execution_plan = list(execution_plan)
                            
                        # Enrich Runtime Steps with Static Labels
                        if execution_plan and node_label_map:
                            for step in execution_plan:
                                if isinstance(step, dict):
                                    nid = step.get("id") or step.get("node_id")
                                    if nid and nid in node_label_map:
                                        step["label"] = node_label_map[nid]
                                        # Also fix generic types if needed
                                        if step.get("type") == "LLM_GENERATION":
                                             step["type"] = "GENERATOR" # Friendly for UI logic?
                        
                        # Merge Iterative Steps if present
                            
                        # Merge Iterative Steps if present
                        iterative_plan = full_state.get("iterative_plan")
                        if iterative_plan and isinstance(iterative_plan, list):
                            print(f"[SmartTemplate] Appending {len(iterative_plan)} iterative cycles to execution plan.")
                            execution_plan.extend(iterative_plan)

                        # Wrap in object for Frontend (ExecutionPlanModal expects { nodes: [...] })
                        execution_plan_obj = {
                            "nodes": execution_plan,
                            "templateName": template.name,
                            "executionId": context_id if 'context_id' in locals() else None
                        }
                        
                        thing_content = {
                            "text": generated_content,
                            "markdown": generated_content,
                            "execution_plan": execution_plan_obj,
                            "agent_analysis": execution_plan_obj, # Legacy/Safety
                            "is_deep_analysis": True
                        }
                        
                        # Set default title if empty
                        if not thing_title:
                            thing_title = f"Deep Analysis: {template.name}"
                            
                        # Skip standard resolution
                        print(f"[SmartTemplate] Deep Analysis Content Prepared. Length: {len(generated_content)}")
                        
                        # (Optional) Verify we have what we need
                        if not execution_plan:
                            print("[SmartTemplate] WARNING: No execution_plan found in full_state for Deep Analysis!")

                    # --- STANDARD ANALYSIS HANDLING (Legacy) ---
                    else:
                        # Get Current Node info
                        # Prefer last_executed_node (set by runtime) as current_node might be None (end of flow)
                        current_node_id = full_state.get("last_executed_node") or full_state.get("current_node")
                        current_node_params = {}
                        
                        if current_node_id and template.pipeline_config:
                            # Find node in pipeline config
                            nodes = template.pipeline_config.get("nodes", {})
                            steps = template.pipeline_config.get("steps", []) # Check for linear steps format

                            # 1. Try "nodes" (Graph format)
                            if isinstance(nodes, list) and nodes: # Array format
                                 for n in nodes:
                                     if n.get("id") == current_node_id:
                                         current_node_params = n.get("data", {}).get("params", {}) or n.get("params", {})
                                         break
                            elif isinstance(nodes, dict) and nodes: # Dict format
                                 node_def = nodes.get(current_node_id, {})
                                 current_node_params = node_def.get("data", {}).get("params", {}) or node_def.get("params", {})
                            
                            # 2. Try "steps" (Linear format) if no params found yet
                            if not current_node_params and isinstance(steps, list):
                                print(f"[SmartTemplate] Checking {len(steps)} steps for params...")
                                for s in steps:
                                    if s.get("id") == current_node_id:
                                        current_node_params = s.get("params", {})
                                        print(f"[SmartTemplate] Found node in STEPS! Params keys: {current_node_params.keys()}")
                                        break
                            
                            if not current_node_params:
                                 print(f"[SmartTemplate] WARNING: Params not found in nodes OR steps for ID: {current_node_id}")

                        print(f"[SmartTemplate] Final Node Params: {current_node_params.keys()}")

                        # Helper to resolve format from DB or string
                        def resolve_fmt_type(fmt_val):
                            if not fmt_val: return None, None
                            # Try DB lookup if it looks like a UUID (len 36)
                            if len(str(fmt_val)) == 36:
                                 fmt_obj = db.query(models.SmartOutputFormat).filter(models.SmartOutputFormat.id == str(fmt_val)).first()
                                 if fmt_obj:
                                     return fmt_obj.type.lower(), fmt_obj.extension.lower()
                            return "unknown", str(fmt_val).lower()

                    # 3. Parameter-Based Type Resolution
                    
                    # 3. Deterministic Category Resolution (Visualizer -> Formatter)
                    target_format_id = None
                    resolved_category = "text" # Default
                    
                    # A. Find the Visualizer Step to determine Category
                    visualizer_step = None
                    if isinstance(steps, list):
                        for s in steps:
                            if s.get("type") == "visualizer":
                                visualizer_step = s
                                # Keep searching to find the *last* one if multiple
                    
                    # B. If Visualizer found, get its Category from DB
                    if visualizer_step and visualizer_step.get("config", {}).get("renderingType"):
                        r_type_id = visualizer_step["config"]["renderingType"]
                        r_type_obj = db.query(models.SmartRenderingType).filter(models.SmartRenderingType.id == r_type_id).first()
                        if r_type_obj:
                            resolved_category = r_type_obj.category.lower()
                            print(f"[SmartTemplate] Found Visualizer Category: {resolved_category}")
                    
                    # ROBUST FIX: Explicitly find Formatter Step config
                    # The 'last_executed_node' might be misleading (e.g. pointing to Extractor).
                    # We know valid Output Config lives in the Formatter step.
                    formatter_params = {}
                    if isinstance(steps, list):
                        for s in steps:
                            if s.get("type") == "formatter":
                                formatter_params = s.get("params", {})
                                break
                    elif isinstance(nodes, list):
                         for n in nodes:
                             if n.get("type") == "formatter" or "formatter" in n.get("id", ""):
                                 formatter_params = n.get("data", {}).get("params", {}) or n.get("params", {})
                                 break

                    # Fallback to current_node_params if formatter not found (legacy or generic agent)
                    target_params = formatter_params or current_node_params

                    # C. Select the appropriate Format ID
                    # Priority: 1. Unified 'outputFormatId' 2. Legacy Category-based IDs
                    unified_fmt_id = target_params.get("outputFormatId") or target_params.get("output_format_id")
                    
                    # LOGGING START
                    with open("C:/Users/opole/Downloads/ChatBotn/backend/debug_trace.txt", "a") as trace:
                         trace.write(f"\n[TRACE] Target Params Keys: {list(target_params.keys())}\n")
                         trace.write(f"[TRACE] Unified ID: {unified_fmt_id}\n")
                         trace.write(f"[TRACE] Resolved Category (Visualizer): {resolved_category}\n")
                    # LOGGING END

                    if unified_fmt_id:
                         target_format_id = unified_fmt_id
                    elif "text" in resolved_category or "summary" in resolved_category:
                        target_format_id = target_params.get("text_format") or target_params.get("textFormatId")
                    elif "picture" in resolved_category or "image" in resolved_category or "diagram" in resolved_category:
                        target_format_id = target_params.get("graphic_format") or target_params.get("graphicsFormatId")
                    elif "table" in resolved_category or "data" in resolved_category:
                        target_format_id = target_params.get("data_format") or target_params.get("dataFormatId")
                    
                    # Override for Chart/Component Output (Rich Visualization)
                    if isinstance(current_output, dict) and "visualizer_output" in current_output:
                        vp = current_output["visualizer_output"].get("visual_payload", {})
                        st = vp.get("structure_type", "").lower()
                        # Detect rich visualization intent - simplified to trust the key
                        # If 'visualizer_output' exists, it is an Agent Result designed for ThingNode consumption
                        print(f"[SmartTemplate] Detected 'visualizer_output'. Overriding format to AGENT_RESULT.")
                        target_format_id = "CHART_OVERRIDE"

                    print(f"[SmartTemplate] Selected Format ID: {target_format_id} (Category: {resolved_category})")

                    # D. Resolve the Target Format
                    if target_format_id:
                        if target_format_id == "CHART_OVERRIDE":
                             thing_type = ThingType.AGENT_RESULT
                             # WRAPPER FIX: Frontend expects thing.content.visualizer_output
                             thing_content = {"visualizer_output": current_output["visualizer_output"]}
                             _p_type, fmt_ext = "visualizer", "json"
                             print(f"[SmartTemplate] Handling CHART_OVERRIDE. Assigned Content: {str(thing_content)[:100]}...")
                        else:
                            _p_type, fmt_ext = resolve_fmt_type(target_format_id)
                        
                        # LOGGING TYPE RESOLUTION
                        with open("C:/Users/opole/Downloads/ChatBotn/backend/debug_trace.txt", "a") as trace:
                             trace.write(f"[TRACE] Target ID: {target_format_id}\n")
                             trace.write(f"[TRACE] Resolved Type: {_p_type}, Ext: {fmt_ext}\n")
                        
                        # Graphic/Image
                        if "image" in str(fmt_ext) or "image" in str(_p_type) or "picture" in resolved_category:
                             thing_type = ThingType.IMAGE
                             thing_content["image_url"] = outputs.get("image_url", "")
                             
                             # Extract Image content
                             if isinstance(current_output, dict):
                                  raw = current_output
                                  thing_content = {
                                     "url": raw.get("image_url") or raw.get("url"),
                                     "alt_text": raw.get("alt_text") or "Generated Image"
                                  }
                             else:
                                  thing_content = {
                                     "url": str(current_output),
                                     "alt_text": "Generated Image"
                                  }

                        # Table/Data
                        # Prevent overwriting AGENT_RESULT (which uses json/visualizer types)
                        elif ("csv" in str(fmt_ext) or "json" in str(fmt_ext) or "table" in str(_p_type)) and thing_type != ThingType.AGENT_RESULT:
                             thing_type = ThingType.TABLE
                             
                             # DEBUG LOGGING
                             with open("smart_debug.log", "a", encoding="utf-8") as f:
                                 f.write(f"\n[SmartTemplate] Processing TABLE format. CurrentOutput Type: {type(current_output)}\n")
                                 if isinstance(current_output, dict):
                                     f.write(f"[SmartTemplate] Dict Keys: {list(current_output.keys())}\n")
                                 elif isinstance(current_output, str):
                                     f.write(f"[SmartTemplate] String Len: {len(current_output)}\n")

                             # Try to find table data
                             target_content = None
                             if isinstance(current_output, dict):
                                 if "visualizer_output" in current_output:
                                     with open("smart_debug.log", "a", encoding="utf-8") as f: f.write("[SmartTemplate] Found visualizer_output\n")
                                     payload = current_output["visualizer_output"].get("visual_payload", {})
                                     target_content = payload.get("content")
                                 elif "converted_document" in current_output:
                                      # New logic for DocumentConverter output
                                      with open("smart_debug.log", "a", encoding="utf-8") as f: f.write("[SmartTemplate] Found converted_document\n")
                                      target_content = current_output["converted_document"]
                                      with open("smart_debug.log", "a", encoding="utf-8") as f: f.write(f"[SmartTemplate] Content Preview: {str(target_content)[:200]}\n")
                                      
                             elif isinstance(current_output, list):
                                 with open("smart_debug.log", "a", encoding="utf-8") as f: f.write("[SmartTemplate] Output is List, using as data\n")
                                 target_content = current_output
                             
                             # Process found content
                             if target_content:
                                 # 1. Parse Data if not already a list
                                 parsed_data = []
                                 if isinstance(target_content, list):
                                     parsed_data = target_content
                                 else:
                                     val = str(target_content)
                                     thing_content["markdown"] = val
                                     thing_content["text"] = val
                                     
                                     # HTML Table Parsing
                                     if "<table" in val.lower() or "<thead>" in val.lower():
                                         try:
                                             import re
                                             # Simple regex to extract rows
                                             row_pattern = re.compile(r"<tr[^>]*>(.*?)</tr>", re.DOTALL | re.IGNORECASE)
                                             cell_pattern = re.compile(r"<(?:td|th)[^>]*>(.*?)</(?:td|th)>", re.DOTALL | re.IGNORECASE)
                                             
                                             rows = row_pattern.findall(val)
                                             with open("smart_debug.log", "a", encoding="utf-8") as f: f.write(f"[SmartTemplate] Regex found {len(rows)} rows\n")
                                             
                                             for r in rows:
                                                 cells = cell_pattern.findall(r)
                                                 # Clean cell text
                                                 clean_cells = []
                                                 for c in cells:
                                                     # Remove nested tags and bold markers
                                                     text = re.sub(r"<[^>]+>", "", c)
                                                     text = text.replace("&nbsp;", " ").replace("**", "").strip()
                                                     clean_cells.append(text)
                                                 if clean_cells:
                                                     parsed_data.append(clean_cells)
                                             
                                             with open("smart_debug.log", "a", encoding="utf-8") as f: 
                                                  f.write(f"[SmartTemplate] Parsed {len(parsed_data)} rows from HTML table\n")
                                         except Exception as e:
                                             with open("smart_debug.log", "a", encoding="utf-8") as f: f.write(f"[SmartTemplate] Error parsing HTML table: {e}\n")
                                             print(f"Error parsing HTML table: {e}")

                                     # CSV Fallback
                                     elif "csv" in str(fmt_ext) and not parsed_data:
                                          try:
                                               import csv
                                               from io import StringIO
                                               f = StringIO(val)
                                               reader = csv.reader(f)
                                               data = list(reader)
                                               if data: parsed_data = data
                                          except Exception as e:
                                               with open("smart_debug.log", "a", encoding="utf-8") as f: f.write(f"[SmartTemplate] Error parsing CSV: {e}\n")
                                 
                                 # 2. Assign Data
                                 if parsed_data:
                                     thing_content["data"] = parsed_data
                                     with open("smart_debug.log", "a", encoding="utf-8") as f: f.write(f"[SmartTemplate] Assigned {len(parsed_data)} rows to thing_content['data']\n")
                                 
                             
                             # Fallback: If we wanted a TABLE but got no data, check if we have text/markdown
                             if "data" not in thing_content and not thing_content.get("markdown"):
                                 with open("smart_debug.log", "a", encoding="utf-8") as f: f.write("[SmartTemplate] No data found yet. Checking fallbacks...\n")
                                 # We failed to get structured table data.
                                 # Check if we have standard text output (fallback from TextTemplate)
                                 # OR if we have Agent's formatted_output (SWOT table)
                                 raw_text = None
                                 if isinstance(current_output, dict):
                                      raw_text = (
                                          current_output.get("analysis_results", {}).get("formatted_output") or
                                          current_output.get("generated_markdown") or 
                                          current_output.get("_raw")
                                      )
                                 elif isinstance(current_output, str):
                                      # If it's a TABLE type and we have a string (likely CSV from DocumentConverter)
                                      with open("debug_csv.txt", "a") as log:
                                          log.write(f"\n[SmartTemplate DEBUG] Checking CSV Parse. ThingType: {thing_type}, Ext: {fmt_ext}, OutputType: {type(current_output)}\n")
                                      
                                      if thing_type == ThingType.TABLE and "csv" in str(fmt_ext):
                                          try:
                                              import csv
                                              from io import StringIO
                                              f = StringIO(current_output)
                                              reader = csv.reader(f)
                                              data = list(reader)
                                              with open("debug_csv.txt", "a") as log:
                                                  log.write(f"[SmartTemplate DEBUG] Parsed CSV Data Rows: {len(data)}\n")
                                              
                                              if data:
                                                  thing_content["data"] = data
                                                  raw_text = None # Do not trigger fallback
                                              else:
                                                  raw_text = current_output
                                          except Exception as e:
                                              with open("debug_csv.txt", "a") as log:
                                                  log.write(f"[SmartTemplate DEBUG] Failed to parse: {e}\n")
                                              raw_text = current_output
                                      else:
                                          with open("debug_csv.txt", "a") as log:
                                              log.write(f"[SmartTemplate DEBUG] Condition Failed. ThingType==TABLE? {thing_type == ThingType.TABLE}, 'csv' in ext? {'csv' in str(fmt_ext)}\n")
                                          raw_text = current_output
                                  
                                 if raw_text:
                                      print(f"[SmartTemplate] Table extraction failed, falling back to TEXT node with content (Len: {len(raw_text)}).")
                                      thing_type = ThingType.TEXT
                                      # The text extraction block below will handle populating logic
                                      # BUT we must ensure current_output is passed correctly or handled 
                                      # Actually, the block below 'if thing_type == ThingType.TEXT' re-reads current_output.
                                      # We just need to make sure it finds the formatted_output there too. (We fixed that in Step 1396)
                                  
                        # Text/Document (Default)
                        elif thing_type != ThingType.AGENT_RESULT:
                             f_path = outputs.get("file_path", "")
                             if ("pdf" in str(fmt_ext) or "document" in str(_p_type)) and f_path:
                                 thing_type = ThingType.DOCUMENT
                                 thing_content["file_path"] = f_path
                             else:
                                 # Fallback to TEXT if no file path provided, even for PDF format
                                 thing_type = ThingType.TEXT
                    else:
                        # Fallback if no format selected: Default to Text
                        thing_type = ThingType.TEXT
                        
                    # Extract Text/Markdown Content (Default or if explicit TEXT)
                    # Extract Text/Markdown Content (Default or if explicit TEXT)
                    if thing_type == ThingType.TEXT and not template.document_template_id:
                         if isinstance(current_output, dict):
                            raw = current_output
                            # Check for specific 'formatted_output' (SWOT table etc) from Agent
                            # Or standard fields
                            val = (
                                raw.get("analysis_results", {}).get("formatted_output") or 
                                raw.get("generated_markdown") or 
                                raw.get("text") or 
                                raw.get("content") or
                                raw.get("filled_body") or
                                raw.get("_raw") or 
                                raw.get(current_node_params.get("output_variable") or "converted_document") or
                                str(raw)
                            )
                            # CRITICAL: Ensure we never pass a dict/list as 'text' to frontend logic
                            final_text = str(val) if isinstance(val, (dict, list)) else val
                            thing_content = {"text": final_text, "markdown": final_text}
                         else:
                             val = str(current_output or "")
                             
                             # ROBUSTNESS FIX: If output is effectively empty (AI failed to find data)
                             # Look back at extractor_output or other findings in the state.
                             if (not val or val.strip() in ["[]", "{}", "No findings", "None"]) and not template.document_template_id:
                                 print("[SmartTemplate] Final output is effectively empty. Looking back for findings...")
                                 variables = full_state.get("variables", {})
                                 lookback_vars = ["agent_output", "extractor_output", "analysis_results", "text_output"]
                                 
                                 for var_name in lookback_vars:
                                     lookback_val = variables.get(var_name)
                                     if lookback_val:
                                         # If it's the extractor output, format it nicely
                                         if var_name == "extractor_output" and isinstance(lookback_val, dict) and "extracted_elements" in lookback_val:
                                             elements = lookback_val.get("extracted_elements", [])
                                             if elements:
                                                 val = "### Extraction Findings\n" + "\n".join([f"- {e.get('data')}" for e in elements])
                                                 print(f"[SmartTemplate] Recovered findings from {var_name}")
                                                 break
                                         elif isinstance(lookback_val, str) and len(lookback_val) > 20:
                                             val = lookback_val
                                             print(f"[SmartTemplate] Recovered findings from {var_name}")
                                             break
                                             
                             thing_content = {"text": val, "markdown": val}

                    # If valid content to persist
                    if thing_content:

                        try:
                            # 1. Create Result Node
                            # Imports are global now
                            
                            # Determine Target Canvas ID
                            # CRITICAL FIX: Always co-locate result with the source nodes.
                            # If we rely solely on request.canvas_id, we might create the node on a "shadow" canvas
                            # if the Frontend URL state is desynchronized from the actual node location.
                            target_canvas_id = request.canvas_id
                            if things:
                                # Use the canvas_id of the first source node (assuming all sources are on same canvas for now)
                                # If cross-canvas sources are supported later, we might need a different strategy,
                                # but for now, co-location is key for links to work.
                                target_canvas_id = things[0].canvas_id
                                if str(target_canvas_id) != str(request.canvas_id):
                                     print(f"[SmartTemplate] CORRECTING CANVAS ID: Request={request.canvas_id}, SourceNode={target_canvas_id}. Forcing co-location.")
                                
                            # Debug Log for User
                            yield {"type": "log", "content": f"Finalizing... Creating Result Node on Canvas {target_canvas_id}"}

                            
                            # Calculate Centroid Position from Input Things
                            pos_x, pos_y = 400.0, 300.0 # Default fallback
                            if things:
                                count = len(things)
                                # Ensure we handle None values just in case
                                valid_things = [t for t in things if t.position_x is not None and t.position_y is not None]
                                if valid_things:
                                    count = len(valid_things)
                                    pos_x = sum([t.position_x for t in valid_things]) / count
                                    pos_y = sum([t.position_y for t in valid_things]) / count
                                    
                                    # Improved Positioning Strategy: "Next To" (Right Side)
                                    # Mimic Frontend logic: Place new node to the right of the source.
                                    # Find the right-most edge of the selection
                                    max_right = -float('inf')
                                    top_y = float('inf')
                                    
                                    for t in valid_things:
                                        t_x = t.position_x or 0
                                        t_y = t.position_y or 0
                                        t_w = t.width if t.width is not None else 400.0 # Default width
                                        
                                        right_edge = t_x + t_w
                                        if right_edge > max_right:
                                            max_right = right_edge
                                            # Align top with the right-most element (or average? Let's use average Y or top Y)
                                        
                                        if t_y < top_y:
                                            top_y = t_y
                                            
                            # Set new position relative to the bounding box of selection
                                    pos_x = max_right + 50.0 
                                    pos_y = top_y # Align tops
                                    
                            # Inject Agent Analysis into Metadata (if available)
                            # This enables the "Green Brain" icon on the frontend
                            agent_analysis = None
                            
                            # 1. Check direct output (if it's a dict with analysis)
                            if isinstance(current_output, dict):
                                agent_analysis = (
                                    current_output.get("analysis_results", {}).get("formatted_output") or
                                    current_output.get("analysis_results", {}).get("text") or
                                    current_output.get("generated_markdown") 
                                )
                            
                            # 2. Resurrect from Variables (if current_output is Visualizer/Chart)
                            if not agent_analysis and "variables" in full_state:
                                vars = full_state["variables"]
                                
                                # Look for Agent Step output
                                # Common variabe names used in blueprints: "agent_output", "analysis", "text"
                                candidate_vars = ["agent_output", "analysis", "text", "extractor_output"]
                                for v in candidate_vars:
                                    val = vars.get(v)
                                    if val and isinstance(val, dict):
                                         # Prioritize Extractor Output (Strict JSON)
                                         if "extracted_elements" in val:
                                             agent_analysis = val
                                         else:
                                             agent_analysis = (
                                                 val.get("analysis_results", {}).get("formatted_output") or 
                                                 val.get("generated_markdown") or
                                                 val.get("text")
                                             )
                                    elif val and isinstance(val, str) and len(val) > 100:
                                         agent_analysis = val
                                    
                                    if agent_analysis: break
                                    
                                # If still not found, search by Node ID structure (generic)
                                if not agent_analysis:
                                     # Try to find a node output that looks like markdown/analysis
                                     for k, v in vars.items():
                                         if isinstance(v, dict) and ("formatted_output" in v.get("analysis_results", {}) or "generated_markdown" in v):
                                             agent_analysis = v.get("analysis_results", {}).get("formatted_output") or v.get("generated_markdown")
                                             break
                            
                            if agent_analysis:
                                # CRITICAL FIX: Ensure agent_analysis is a string to prevent Frontend "Objects are not valid as React child" crash
                                if isinstance(agent_analysis, (dict, list)):
                                     import json
                                     agent_analysis = json.dumps(agent_analysis, indent=2)
                                else:
                                     agent_analysis = str(agent_analysis)

                                print(f"[SmartTemplate] Attaching Agent Analysis to Thing Content (Len: {len(agent_analysis)})")
                                thing_content["agent_analysis"] = agent_analysis

                            # Prefer audited_document if available, otherwise final_document
                            final_doc_content = full_state.get("variables", {}).get("audited_document") or \
                                                full_state.get("variables", {}).get("final_document")
                            if final_doc_content:
                                thing_content["text"] = final_doc_content
                                thing_content["markdown"] = final_doc_content
                                thing_type = ThingType.TEXT # Ensure it's a text node for the document

                            new_node = CanvasThing(
                                canvas_id=target_canvas_id, # Use corrected ID
                                type=thing_type,
                                title=thing_title,
                                content=thing_content,
                                position_x=pos_x,
                                position_y=pos_y,
                                width=350.0,
                                height=250.0
                            )
                            db.add(new_node)
                            db.flush() # Get ID
                            
                            # 2. Link Inputs to Result
                            for t in things:
                                link = CanvasLink(
                                    canvas_id=target_canvas_id, # Use corrected ID (Links must belong to same canvas)
                                    source_id=t.id,
                                    target_id=new_node.id,
                                    type="related", # The user requested "Related" type
                                    label="analyzed_in"
                                )
                                db.add(link)
                            
                            db.commit()
                            db.refresh(new_node)
                            
                            print(f"[SmartTemplate] Created result node {new_node.id} on Canvas {target_canvas_id}")
                            
                            # 3. Notify Frontend
                            yield {
                                "type": "node_created",
                                "node": {
                                    "id": new_node.id,
                                    "title": new_node.title,
                                    "type": new_node.type.value,
                                    "content": new_node.content,
                                    "position_x": new_node.position_x,
                                    "position_y": new_node.position_y,
                                    # Frontend store might expect specific shape, but let's send model shape.
                                    # Actually, let's also send x/y for compatibility if frontend needs it,
                                    # but based on store it uses position_x/y
                                    "x": new_node.position_x,
                                    "y": new_node.position_y,
                                    "canvas_id": target_canvas_id # Send valid canvas ID back so frontend knows where it is
                                }
                            }
                        except Exception as persistence_error:
                            print(f"[SmartTemplate] Failed to persist result: {persistence_error}")
                            db.rollback()
                            yield {"type": "error", "content": f"Execution finished but failed to save result: {persistence_error}"}
                        
                        # CRITICAL FIX: Update event data with final refined content
                        # Ensure the frontend receives the post-audit/refined document in the completion event.
                        if "variables" in full_state:
                             if "outputs" not in event["data"]: event["data"]["outputs"] = {}
                             event["data"]["outputs"].update(full_state["variables"])
                        
                        yield event # Finally yield the delayed complete event
                
        except Exception as e:
            print(f"[SmartTemplate] Execution error: {e}")
            yield {"type": "error", "content": str(e)}

        finally:
            # --- CLEANUP STATUS ---
            if things:
                try:
                    target_t = things[0]
                    # Reset status to remove overlay
                    target_t.rag_status = "completed" 
                    if target_t.content:
                        new_c = dict(target_t.content)
                        # Keep the last status message or clear it?
                        # User might want to see "Analysis Complete" or just see the content.
                        # Usually "completed" hides the overlay in ThingNode.
                        new_c["processing_status"] = "Analysis Complete"
                        target_t.content = new_c
                    db.add(target_t)
                    db.commit()
                    print("[SmartTemplate] Status reset to completed.")
                except Exception as e:
                    print(f"[SmartTemplate] Status Cleanup Failed: {e}")

    def delete_output_format(self, db: Session, item_id: str) -> bool:
        db_item = db.query(models.SmartOutputFormat).filter(models.SmartOutputFormat.id == item_id).first()
        if not db_item:
            return False
        db.delete(db_item)
        db.commit()
        return True

    def _construct_dynamic_graph(self, blueprint, template, context_purpose: str = "") -> Dict[str, Any]:
        """
        Dynamically constructs a LangGraph definition from a TemplateBlueprint.
        Translates Logic Blocks (Sections, Loops, Ifs) into Nodes and Edges.
        """
        import uuid
        from datetime import datetime # For prompt logging
        nodes = []
        edges = []
        
        # 1. Global Context Extractor (Shared)
        # Reuse existing config or create default
        extractor_step = next((s for s in template.pipeline_config.get("steps", []) if "extractor" in s.get("type", "").lower()), None)
        if not extractor_step:
             extractor_step = {
                 "id": "node_context_loader",
                 "type": "extractor",
                 "label": "Context Loader",
                 "config": {"focus": "Relevant data for analysis"}
             }
        else:
             extractor_step["id"] = "node_context_loader"
             extractor_step["label"] = "Context Loader (Shared)"
        nodes.append(extractor_step)
        
        previous_node_id = "node_context_loader"
        
        # 2. Sequential Processor for Blueprint Sections
        
        # 3. Build Graph from Blueprint Sections
        # Capture the variables created by the sections
        section_variables = []
        
        # Global Context for all nodes
        global_context = (
            f"Global Document Goal: {template.name}\\n"
            f"Document Description: {template.description or 'Standard Analysis'}\\n"
        )
        
        # Redefined process_children to track variables and LOG PROMPTS
        def process_children_with_vars(children, parent_prev_id, depth=0):
            from app.services.template_parser import TemplateSection, LoopBlock, ConditionalBlock, TemplateInstruction
            
            current_prev_id = parent_prev_id
            local_nodes = []
            local_edges = []
            local_vars = [] # Track variables generated here
            
            print(f"[SmartTemplate] DEBUG: Entering process_children with {len(children)} items. Depth: {depth}")

            for index, item in enumerate(children):
                node_id = f"node_{depth}_{index}_{str(uuid.uuid4())[:8]}"
                print(f"[SmartTemplate] DEBUG:  - Item {index}: {type(item)}")
                
                # --- CASE A: LOOP ---
                if isinstance(item, LoopBlock):
                    # Recursively build subgraph for the loop body
                    sub_nodes, sub_edges, sub_vars = process_children_with_vars(item.content, "START_SUB")
                    
                    if not sub_nodes: continue 
                        
                    sub_graph_def = {
                        "nodes": sub_nodes,
                        "edges": sub_edges
                    }
                    
                    output_var = f"loop_output_{depth}_{index}"
                    loop_node = {
                        "id": node_id,
                        "type": "FOREACH",
                        "label": f"Loop: {item.source}",
                        "params": {
                            "items": item.source, 
                            "iterator_var": "loop_item",
                            "subprocess_graph": sub_graph_def,
                            "output_variable": output_var
                        }
                    }
                    local_nodes.append(loop_node)
                    local_vars.append(output_var)
                    
                    if current_prev_id and current_prev_id != "START_SUB":
                        local_edges.append({"source": current_prev_id, "target": node_id})
                    
                    current_prev_id = node_id
                    
                # --- CASE B: CONDITIONAL (IF) ---
                elif isinstance(item, ConditionalBlock):
                    if_nodes, if_edges, if_vars = process_children_with_vars(item.if_content, node_id + "_IF_START")
                    else_nodes, else_edges, else_vars = process_children_with_vars(item.else_content, node_id + "_ELSE_START")
                    
                    if if_nodes or else_nodes:
                        merge_id = f"merge_{node_id}"
                        local_nodes.append({"id": merge_id, "type": "NOOP", "label": "Merge"})


                        if if_nodes:
                            first_if = if_nodes[0]
                            local_edges.append({
                                "source": current_prev_id, 
                                "target": first_if["id"],
                                "condition": item.condition 
                            })
                            local_nodes.extend(if_nodes)
                            local_edges.extend(if_edges)
                            local_vars.extend(if_vars)
                            
                            last_if = if_nodes[-1]["id"]
                            local_edges.append({"source": last_if, "target": merge_id})
 
                        if else_nodes:
                            first_else = else_nodes[0]
                            local_edges.append({
                                "source": current_prev_id,
                                "target": first_else["id"],
                                "condition": f"not ({item.condition})" 
                            })
                            local_nodes.extend(else_nodes)
                            local_edges.extend(else_edges)
                            local_vars.extend(else_vars)
                            
                            last_else = else_nodes[-1]["id"]
                            local_edges.append({"source": last_else, "target": merge_id})
                        else:
                            local_edges.append({
                                "source": current_prev_id,
                                "target": merge_id,
                                "condition": f"not ({item.condition})"
                            })
                            
                        current_prev_id = merge_id
                    
                # --- CASE C: SECTION ---
                elif isinstance(item, TemplateSection):
                     # 1. Collect Instructions & Text from children (for THIS section's prompt)
                     # We want to separate "Content" (Strings/Instructions) from "Logic" (Loops/Conditionals)
                     instr_list = []
                     logic_children = []
                     
                     if item.instructions:
                         instr_list.extend([i.text for i in item.instructions])
                         
                     # Also walk children to split them
                     if item.children:
                         for child in item.children:
                             if isinstance(child, TemplateInstruction):
                                 # It's already in item.instructions if parser works, but let's be safe/dedupe?
                                 # Parser adds to both. So sticking to item.instructions is safer/cleaner.
                                 pass
                             elif isinstance(child, (LoopBlock, ConditionalBlock)):
                                 logic_children.append(child)
                             elif isinstance(child, str):
                                 # Raw text content - treat as instruction/context
                                 instr_list.append(child)
                     
                     instr_text = "\n".join(instr_list)
                     
                     # --- CRITICAL DEBUG: PRINT SECTION DETAILS (Requested by User) ---
                     # Stop condition logic effectively handled by just printing this before node generation.
                     # The single-section mode then limits execution, allowing user to see this log.
                     def _safe_print(msg):
                         try:
                             print(msg.encode('utf-8', 'replace').decode('utf-8'))
                         except:
                             print(max) # Fallback

                     _safe_print(f"\n[SmartTemplate] Processing Section: '{item.title}'")
                     print(f"  - Instruction Count: {len(item.instructions)}")
                     
                     # --- USER REQUESTED BIG LOG ---
                     print("\n" + "="*60)
                     print(f"*** INSTRUCTIONS FOR SECTION '{item.title}' ***")
                     if item.instructions:
                         for i_idx, instr in enumerate(item.instructions):
                             _safe_print(f"  [{i_idx+1}] {instr.text}")
                     else:
                         print("  [WARNING] NO INSTRUCTIONS FOUND FOR THIS SECTION")
                     print("="*60 + "\n")
                     # ------------------------------

                     _safe_print(f"  - Final Prompt Text: '{instr_text[:500]}...'")
                     # -----------------------------------------------------------------
                     
                     # 2. Generate Content Node for THIS Section
                     # FIX: Strict Sanitization for Jinja2 compatibility (Alphanumeric + Underscore only)
                     import re
                     safe_title = re.sub(r'[^a-zA-Z0-9_]', '_', item.title.replace(' ', '_'))
                     out_var = f"output_{safe_title}_{depth}_{index}"
                     
                     prompt_text = (
                         f"{global_context}\n"
                         f"You are writing the section: '{item.title}'.\n"
                         f"Specific Instructions: {instr_text}\n"
                         f"Context: Use the available data to write this specific section."
                     )
                     
                     # LOG PROMPT
                     try:
                         with open("C:/Users/opole/Downloads/ChatBotn/backend/smart_template_prompts.log", "a", encoding="utf-8") as pf:
                             pf.write(f"\n[{datetime.utcnow()}] Processing section '{item.title}'\nPrompt: {prompt_text}\n{'='*40}\n")
                     except Exception: pass

                     # Header Logic: Depth 0 -> ##, Depth 1 -> ###, etc.
                     header_hashes = "#" * (min(depth + 2, 6))
                     section_header = f"{header_hashes} {item.title}"
                     
                     gen_node = {
                         "id": node_id,
                         "type": "LLM_GENERATION",
                        "label": f"Drafting Section: {item.title}",
                         "params": {
                             "system_prompt": (
                                 "You are a Strict Section Writer.\n"
                                 "ABSOLUTE RULES - VIOLATION = FAILURE:\n"
                                 f"1. You are writing ONLY the section titled: '{item.title}'\n"
                                 f"2. START your response with EXACTLY this header: {section_header}\n"
                                 "3. Write ONLY the content for THIS SECTION - nothing else.\n"
                                 "4. DO NOT write any other sections.\n"
                                 "5. DO NOT write an introduction or summary of the whole document.\n"
                                 "6. DO NOT repeat the document title or purpose.\n"
                                 "7. STOP when this section is complete - do not continue to other sections.\n"
                                 "8. If you need sub-sections, they MUST be nested under this section header.\n"
                                 "9. PRESERVE any numbering in the section title (e.g. '1.1 Analysis').\n"
                             ),
                             "prompt": prompt_text,
                             "target_variable": out_var,
                             # FIX: Use 'markdown' format to disable strict JSON but avoid rigid Template Filling mode
                             "output_format": "markdown",
                             "is_template_mode": False 
                         }
                     }
                     local_nodes.append(gen_node)
                     # FIX: runtime key is node_id, not target_variable
                     local_vars.append(node_id)
                     
                     if current_prev_id and current_prev_id != "START_SUB":
                         local_edges.append({"source": current_prev_id, "target": node_id})
                     current_prev_id = node_id
                     
                     # 3. Process Logic Children (Recursion)
                     # Any loops/ifs nested inside this section should also be executed
                     # and their output will be collected by the Compiler.
                     if logic_children:
                         sec_nodes, sec_edges, sec_vars = process_children_with_vars(logic_children, current_prev_id, depth+1)
                         local_nodes.extend(sec_nodes)
                         local_edges.extend(sec_edges)
                         local_vars.extend(sec_vars)
                         if sec_nodes:
                             current_prev_id = sec_nodes[-1]["id"]

                # --- CASE D: INSTRUCTION (Leaf) ---
                elif isinstance(item, TemplateInstruction):
                     out_var = f"instr_output_{depth}_{index}"
                     
                     instr_prompt = f"{global_context}\\nExecute this instruction: {item.text}"
                     
                     action_node = {
                         "id": node_id,
                         "type": "LLM_GENERATION",
                        "label": f"Execute: {item.text[:60] + '...' if len(item.text) > 60 else item.text}",
                         "params": {
                             "prompt": instr_prompt,
                             "target_variable": out_var,
                             "is_template_mode": False
                         }
                     }
                     local_nodes.append(action_node)
                     # FIX: runtime key is node_id
                     local_vars.append(node_id)
                     
                     if current_prev_id and current_prev_id != "START_SUB":
                         local_edges.append({"source": current_prev_id, "target": node_id})
                     current_prev_id = node_id
                
                # --- CASE E: RAW STRING (Ignore) ---
                elif isinstance(item, str):
                    continue
                     
            return local_nodes, local_edges, local_vars

        # --- 2. Construct Prompt & Context ---
        
        # EXTRACT PURPOSE (Context arg or Fallback)
        template_purpose = context_purpose
        if not template_purpose:
             t_struct = getattr(template, "structure", None) or getattr(template, "pipeline_config", None)
             if t_struct and isinstance(t_struct, dict):
                 template_purpose = t_struct.get("purpose", "")
        
        if template_purpose:
             print(f"[SmartTemplate] Using Template Purpose: '{template_purpose}'")
        
        # Base context
        global_context = (
            f"Global Document Goal: {template.name}\\n"
            f"Document Description: {template.description or 'Standard Analysis'}\\n"
        )
        
        # Inject Purpose if present
        if template_purpose:
             global_context = f"TEMPLATE PURPOSE: {template_purpose}\n\n" + global_context

        # Add Blueprint constraints if avail
        if blueprint and blueprint.constraints:
            global_context += f"Global Constraints: {blueprint.constraints}\n"

        # 3. Build Graph from Blueprint Sections
        if not blueprint.sections:
            print("[SmartTemplate] Warning: Blueprint has no sections.")
            return {"nodes": nodes, "edges": edges}
        
        # DEBUG: Log all sections in blueprint BEFORE processing
        print(f"\n[SmartTemplate] *** BLUEPRINT SECTIONS DEBUG ***")
        print(f"[SmartTemplate] Total sections in blueprint: {len(blueprint.sections)}")
        for i, sec in enumerate(blueprint.sections):
            sec_children_summary = f"{len(sec.children)} children" if sec.children else "no children"
            sec_instr_summary = f"{len(sec.instructions)} instructions" if sec.instructions else "no instructions"
            print(f"  [{i}] '{sec.title}' (level {sec.level}) - {sec_children_summary}, {sec_instr_summary}")
            # Also log children types
            for j, child in enumerate(sec.children[:3]):  # First 3 children only
                child_type = type(child).__name__
                child_title = getattr(child, 'title', getattr(child, 'text', str(child)[:30]))
                print(f"      └─ [{j}] {child_type}: {child_title[:50]}...")
        print("[SmartTemplate] *** END BLUEPRINT DEBUG ***\n")
            
        child_nodes, child_edges, gathered_vars = process_children_with_vars(blueprint.sections, previous_node_id)
        
        nodes.extend(child_nodes)
        edges.extend(child_edges)
        
        # --- DOCUMENT AGGREGATION ---
        print(f"[SmartTemplate] Gathering vars for aggregation. Count: {len(gathered_vars)}")
        print(f"[SmartTemplate] Gathered variable names: {gathered_vars}")
        
        # DEBUG: Save aggregation details to file
        try:
            debug_dir = "C:/Users/opole/Downloads/ChatBotn/backend/debug_docs"
            import os
            os.makedirs(debug_dir, exist_ok=True)
            with open(f"{debug_dir}/AGGREGATOR_DEBUG.txt", "w", encoding="utf-8") as f:
                f.write(f"# AGGREGATOR DEBUG INFO\n")
                f.write(f"# Timestamp: {datetime.utcnow()}\n\n")
                f.write(f"## Gathered Variables ({len(gathered_vars)}):\n")
                for i, v in enumerate(gathered_vars):
                    f.write(f"  {i+1}. {v}\n")
                f.write("\n")
        except Exception as e:
            print(f"[SmartTemplate] DEBUG: Failed to write aggregator debug: {e}")
        
        # Aggregate all section outputs into 'final_document'.
        if gathered_vars:
            aggregator_id = f"node_aggregator_{str(uuid.uuid4())[:8]}"
            
            # Aggregator Template - Clean Concatenation
            # We rely on each section to provide its own Markdown header (enforced by system prompt)
            # Use Jinja2 or-chaining for fallback values (default() only accepts literals)
            agg_parts = []
            for v in gathered_vars:
                # Access the section output dict and try to get generated_markdown, text, or output
                # Using 'or' chaining which Jinja2 evaluates left-to-right
                agg_parts.append(
                    f"{{{{ ({v}.get('generated_markdown') or {v}.get('text') or {v}.get('output', '')) | default('') }}}}"
                )
            agg_template = "\n\n".join(agg_parts)
            
            # DEBUG: Log and save the aggregator template
            print(f"[SmartTemplate] Aggregator Template:\n{agg_template[:500]}...")
            try:
                with open(f"{debug_dir}/AGGREGATOR_DEBUG.txt", "a", encoding="utf-8") as f:
                    f.write(f"## Aggregator Template String:\n```\n{agg_template}\n```\n")
            except Exception: pass
            
            aggregator_node = {
                "id": aggregator_id,
                "type": "TEXT_TEMPLATE",
                "label": "Document Assembler",
                "params": {
                    "mode": "simple",
                    "template_string": agg_template,
                    "output_variable": "final_document",
                    "variables": {} 
                }
            }
            nodes.append(aggregator_node)
            
            # Link last added child node to aggregator
            if child_nodes:
                last_child_id = child_nodes[-1]["id"]
                edges.append({
                    "source": last_child_id, 
                    "target": aggregator_id
                })
        # ----------------------------
        
        # 4. SKIPPED: COMPILER NODE (FORCE SINGLE SECTION DEBUG)
        # 5. SKIPPED: AUDITOR NODE (FORCE SINGLE SECTION DEBUG)
        
        print(f"\n[SmartTemplate] DEBUG GRAPH TOPOLOGY:")
        print(f"Nodes ({len(nodes)}): {[n['id'] for n in nodes]}")
        print(f"Edges ({len(edges)}): {[e['source'] + ' -> ' + e['target'] for e in edges]}")
        
        return {
            "nodes": nodes,
            "edges": edges
        }

smart_template_service = SmartTemplateService()
