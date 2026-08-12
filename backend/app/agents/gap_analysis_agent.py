import logging
from typing import TypedDict, List, Dict, Any, Optional
from langgraph.graph import StateGraph, END
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI
import json

from app.schemas.gap_analysis_schemas import GapAnalysisReport, GapMigrationStep, GapDiffElement

logger = logging.getLogger(__name__)

# =============================================================================
# State Definition
# =============================================================================
class GapAnalysisState(TypedDict):
    baseline_docs: List[str]
    target_docs: List[str]
    baseline_facts: List[Dict[str, Any]]
    target_facts: List[Dict[str, Any]]
    diff_results: Dict[str, Any]
    final_report: Optional[GapAnalysisReport]
    errors: List[str]

# =============================================================================
# Nodes
# =============================================================================
from pydantic import BaseModel
from app.services.llm_service import LLMService

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

def get_llm():
    service = LLMService()
    llm, _ = service._get_model("default")
    return llm

def extract_baseline_node(state: GapAnalysisState) -> GapAnalysisState:
    logger.info("Running extract_baseline_node...")
    llm = get_llm().with_structured_output(ExtractionResult)
    docs_text = "\n".join(state.get("baseline_docs", []))
    
    if not docs_text.strip():
        return {"baseline_facts": [{"id": "b1", "name": "Legacy ERP", "type": "ApplicationComponent"}]}
        
    prompt = f"Extract all architectural elements (Business, Application, Technology) from this baseline document:\n\n{docs_text}"
    try:
        res = llm.invoke([HumanMessage(content=prompt)])
        return {"baseline_facts": [e.model_dump() for e in res.elements]}
    except Exception as e:
        logger.error(f"Extraction failed: {e}")
        return {"baseline_facts": []}

def extract_target_node(state: GapAnalysisState) -> GapAnalysisState:
    logger.info("Running extract_target_node...")
    llm = get_llm().with_structured_output(ExtractionResult)
    docs_text = "\n".join(state.get("target_docs", []))
    
    if not docs_text.strip():
        return {"target_facts": [{"id": "t1", "name": "Cloud ERP", "type": "ApplicationComponent"}]}
        
    prompt = f"Extract all architectural elements (Business, Application, Technology) from this target document:\n\n{docs_text}"
    try:
        res = llm.invoke([HumanMessage(content=prompt)])
        return {"target_facts": [e.model_dump() for e in res.elements]}
    except Exception as e:
        logger.error(f"Extraction failed: {e}")
        return {"target_facts": []}

def mapping_reconciliation_node(state: GapAnalysisState) -> GapAnalysisState:
    logger.info("Running mapping_reconciliation_node...")
    llm = get_llm().with_structured_output(MappedDiff)
    
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
        res = llm.invoke([HumanMessage(content=prompt)])
        return {"diff_results": res.model_dump()}
    except Exception as e:
        logger.error(f"Mapping failed: {e}")
        return {"diff_results": {"added": [], "removed": [], "modified": [], "unchanged": []}}

def generate_report_node(state: GapAnalysisState) -> GapAnalysisState:
    logger.info("Running generate_report_node...")
    llm = get_llm().with_structured_output(GapAnalysisReport)
    diff_results = state.get("diff_results", {})
    
    prompt = f"""Generate a detailed Gap Analysis Report based on this diff.
Create logical migration steps to move from baseline to target.

Diff:
{json.dumps(diff_results, indent=2)}
"""
    try:
        report = llm.invoke([
            SystemMessage(content="You are an expert Enterprise Architect."),
            HumanMessage(content=prompt)
        ])
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
