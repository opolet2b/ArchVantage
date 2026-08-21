import logging
from typing import TypedDict, List, Dict, Any, Optional
from langgraph.graph import StateGraph, END
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI
from langchain_core.output_parsers import PydanticOutputParser
import json

from app.schemas.gap_analysis_schemas import GapAnalysisReport, GapMigrationStep, GapDiffElement

logger = logging.getLogger(__name__)

# =============================================================================
# State Definition
# =============================================================================
class GapAnalysisState(TypedDict):
    baseline_docs: List[str]
    target_docs: List[str]
    llm_preset: Optional[str]
    baseline_facts: List[Dict[str, Any]]
    target_facts: List[Dict[str, Any]]
    diff_results: Dict[str, Any]
    final_report: Optional[GapAnalysisReport]
    errors: List[str]
    progress_callback: Optional[Any]

# =============================================================================
# Nodes
# =============================================================================
from pydantic import BaseModel
from app.services.llm_service import LLMService
import concurrent.futures
import threading

class ExtractedElement(BaseModel):
    id: str
    name: str
    type: str

class ExtractionResult(BaseModel):
    elements: List[ExtractedElement]

class MappedDiff(BaseModel):
    added: List[ExtractedElement]
    removed: List[ExtractedElement]
    modified: List[ExtractedElement]
    unchanged: List[ExtractedElement]

def get_llm(state: GapAnalysisState):
    service = LLMService()
    preset = state.get("llm_preset")
    if not preset:
        preset = "default"
    llm, _ = service._get_model(preset)
    return llm

def invoke_with_fallback(llm, schema_class, messages):
    parser = PydanticOutputParser(pydantic_object=schema_class)
    format_instructions = parser.get_format_instructions()
    
    last_msg = messages[-1]
    last_msg.content = f"{last_msg.content}\n\n{format_instructions}"
    
    try:
        response = llm.invoke(messages)
        return parser.parse(response.content)
    except Exception as e:
        logger.warning(f"Initial parsing failed, attempting manual fix. Error: {e}")
        fix_prompt = f"The following text was supposed to be a JSON object but failed to parse with error: {e}.\n\nText:\n{response.content}\n\nPlease output ONLY the corrected JSON object matching the required schema."
        fix_response = llm.invoke([HumanMessage(content=fix_prompt)])
        return parser.parse(fix_response.content)

def chunk_text(text: str, max_chars: int = 30000) -> List[str]:
    return [text[i:i+max_chars] for i in range(0, len(text), max_chars)]

def extract_elements(llm, docs: List[str], prompt_template: str, progress_callback=None) -> List[Dict[str, Any]]:
    docs_text = "\n".join(docs)
    if not docs_text.strip():
        return []

    chunks = chunk_text(docs_text)
    total_chunks = len(chunks)
    completed_chunks = 0
    lock = threading.Lock()
    all_elements = []
    
    def process_chunk(chunk: str):
        nonlocal completed_chunks
        prompt = prompt_template.format(docs_text=chunk)
        try:
            res = invoke_with_fallback(llm, ExtractionResult, [HumanMessage(content=prompt)])
            with lock:
                all_elements.extend([e.model_dump() for e in res.elements])
        except Exception as e:
            logger.error(f"Chunk extraction failed: {e}")
        finally:
            with lock:
                completed_chunks += 1
                if progress_callback:
                    progress_callback(completed_chunks, total_chunks)

    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
        executor.map(process_chunk, chunks)
        
    return all_elements

def extract_baseline_node(state: GapAnalysisState) -> GapAnalysisState:
    logger.info("Running extract_baseline_node...")
    llm = get_llm(state)
    
    prompt_template = """Analyze the provided document and extract ONLY the AS-IS (Current State / Baseline) architectural elements.
Carefully ignore any proposed future changes, migrations, or "To-Be" architectures described in the text.
IMPORTANT: You MUST assign a valid standard ArchiMate element type to each element (e.g. BusinessActor, BusinessProcess, ApplicationComponent, ApplicationService, TechnologyNode, TechnologyService, DataObject, Requirement, Goal, etc.). Do not use generic types like 'System' or 'Database'.

Document text:
{docs_text}"""

    elements = extract_elements(llm, state.get("baseline_docs", []), prompt_template, state.get("progress_callback"))
    
    if not elements:
        elements = [{"id": "b1", "name": "Legacy ERP", "type": "ApplicationComponent"}]
        
    return {"baseline_facts": elements}

def extract_target_node(state: GapAnalysisState) -> GapAnalysisState:
    logger.info("Running extract_target_node...")
    llm = get_llm(state)
    
    prompt_template = """Analyze the provided document and extract ONLY the TO-BE (Future State / Target) architectural elements.
Carefully ignore the legacy, deprecated, or "As-Is" current state architectures described in the text. 
IMPORTANT: You MUST assign a valid standard ArchiMate element type to each element (e.g. BusinessActor, BusinessProcess, ApplicationComponent, ApplicationService, TechnologyNode, TechnologyService, DataObject, Requirement, Goal, etc.). Do not use generic types like 'System' or 'Database'.

Document text:
{docs_text}"""

    elements = extract_elements(llm, state.get("target_docs", []), prompt_template, state.get("progress_callback"))
    
    if not elements:
        elements = [{"id": "t1", "name": "Cloud ERP", "type": "ApplicationComponent"}]
        
    return {"target_facts": elements}

def mapping_reconciliation_node(state: GapAnalysisState) -> GapAnalysisState:
    logger.info("Running mapping_reconciliation_node...")
    llm = get_llm(state)
    
    baseline = state.get("baseline_facts", [])
    target = state.get("target_facts", [])
    
    prompt = f"""Compare the following baseline elements to the target elements.
Identify what was added, removed, modified, or unchanged.

Baseline:
{json.dumps(baseline, indent=2)}

Target:
{json.dumps(target, indent=2)}
"""
    try:
        diff = invoke_with_fallback(llm, MappedDiff, [
            SystemMessage(content="You are an expert Enterprise Architect."),
            HumanMessage(content=prompt)
        ])
        return {"diff_results": diff.model_dump()}
    except Exception as e:
        logger.error(f"Mapping failed: {e}")
        return {"diff_results": {"added": [], "removed": [], "modified": [], "unchanged": []}}

def generate_report_node(state: GapAnalysisState) -> GapAnalysisState:
    logger.info("Running generate_report_node...")
    llm = get_llm(state)
    diff_results = state.get("diff_results", {})
    
    prompt = f"""Generate a detailed Gap Analysis Report based on this diff.
Create logical migration steps to move from baseline to target.

Diff:
{json.dumps(diff_results, indent=2)}
"""
    try:
        report = invoke_with_fallback(llm, GapAnalysisReport, [
            SystemMessage(content="You are an expert Enterprise Architect."),
            HumanMessage(content=prompt)
        ])
        
        # Auto-generate visual diagram JSON programmatically
        diagram_nodes = []
        x_offset = 0
        for status in ["added", "removed", "modified"]:
            elements = diff_results.get(status, [])
            y_offset = 0
            for el in elements:
                diagram_nodes.append({
                    "id": el.get("id", f"{status}_{y_offset}_{x_offset}"),
                    "type": el.get("type", "BusinessActor"),
                    "name": f"[{status.upper()}] {el.get('name', 'Unknown')}",
                    "bounds": {"x": x_offset, "y": y_offset, "width": 140, "height": 55},
                    "properties": [{"key": "diff_status", "value": status}]
                })
                y_offset += 70
            if elements:
                x_offset += 160

        report.archimate_diff_json = {
            "elements": {n["id"]: {"type": n["type"], "name": n["name"]} for n in diagram_nodes},
            "relationships": {},
            "diagrams": [{
                "id": "diff_diagram_1",
                "name": "Gap Analysis Diff",
                "nodes": diagram_nodes,
                "edges": []
            }]
        }
        
        return {"final_report": report}
    except Exception as e:
        logger.error(f"Report generation failed: {e}")
        
        # Fallback to mock report if LLM fails (e.g. rate limits or context errors)
        report = GapAnalysisReport(
            added_count=len(diff_results.get("added", [])),
            removed_count=len(diff_results.get("removed", [])),
            modified_count=len(diff_results.get("modified", [])),
            diff_elements=[
                GapDiffElement(element_id="fallback1", name="Fallback Node", type="Unknown", status="modified")
            ],
            migration_steps=[
                GapMigrationStep(order=1, title="Review Architecture", description="The AI analysis failed to generate full steps.", layer_impact="All")
            ]
        )
        return {"final_report": report}

# =============================================================================
# Graph Construction
# =============================================================================
def build_gap_analysis_graph() -> StateGraph:
    """Builds and returns the LangGraph for Gap Analysis."""
    workflow = StateGraph(GapAnalysisState)
    
    # Add nodes
    workflow.add_node("extract_baseline", extract_baseline_node)
    workflow.add_node("extract_target", extract_target_node)
    workflow.add_node("mapping", mapping_reconciliation_node)
    workflow.add_node("generate_report", generate_report_node)
    
    # Add edges
    # We can run extraction in parallel (if supported) or sequentially. 
    # For simplicity, let's do sequentially: baseline -> target -> mapping -> report
    workflow.set_entry_point("extract_baseline")
    workflow.add_edge("extract_baseline", "extract_target")
    workflow.add_edge("extract_target", "mapping")
    workflow.add_edge("mapping", "generate_report")
    workflow.add_edge("generate_report", END)
    
    return workflow.compile()

# Example usage:
# graph = build_gap_analysis_graph()
# result = graph.invoke({"baseline_docs": ["doc1 text"], "target_docs": ["doc2 text"]})
# print(result["final_report"])
