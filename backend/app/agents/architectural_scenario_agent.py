import logging
from typing import TypedDict, List, Dict, Any, Optional
from langgraph.graph import StateGraph, END
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_core.output_parsers import PydanticOutputParser
from pydantic import BaseModel, Field
import json

from app.services.llm_service import LLMService

logger = logging.getLogger(__name__)

# =============================================================================
# Schemas for Architectural Scenario
# =============================================================================

class ScenarioNode(BaseModel):
    id: str = Field(description="Unique short ID for the node")
    label: str = Field(description="Label of the node to display")
    layer: str = Field(description="One of: business, information, application, technology")
    status: str = Field(description="One of: baseline, new, removed, modified, at_risk")

class ScenarioEdge(BaseModel):
    id: str = Field(description="Unique short ID for the edge")
    source: str = Field(description="Source node ID")
    target: str = Field(description="Target node ID")
    status: str = Field(description="One of: baseline, new, removed, modified")

class AdmPhaseImpact(BaseModel):
    phase: str = Field(description="One of: A (Architecture Vision), B (Business Architecture), C (Information Systems Architecture), D (Technology Architecture), E (Opportunities & Solutions), F (Migration Planning), G (Implementation Governance), H (Architecture Change Management), R (Requirements Management)")
    description: str = Field(description="Detailed strategic analysis and impact for this TOGAF ADM phase")
    risk_level: str = Field(description="Low, Medium, High")

class ArchitecturalBaseline(BaseModel):
    nodes: List[ScenarioNode]
    edges: List[ScenarioEdge]

class ArchitecturalScenarioResult(BaseModel):
    nodes: List[ScenarioNode]
    edges: List[ScenarioEdge]
    adm_impacts: List[AdmPhaseImpact]
    structural_risk_score: int = Field(description="0 to 100")
    structural_risk_rationale: str = Field(description="A detailed explanation justifying the structural risk score based on cross-domain vulnerabilities and dependencies.")
    financial_impact_estimate: str = Field(description="Brief text like '+ $150k'")
    timeline_impact_estimate: str = Field(description="Brief text like '+ 3 Months'")

# =============================================================================
# Graph State
# =============================================================================

class ScenarioGraphState(TypedDict):
    action: str
    target_technology: str
    target_entity_ids: Optional[List[str]]
    custom_prompt: str
    document_context: str
    
    mutation_spec: Optional[str]
    active_subgraph: Optional[str]
    impact_assessment: Optional[str]
    tobe_graph: Optional[str]
    remediation_plan: Optional[str]
    
    baseline: Optional[ArchitecturalBaseline]
    result: Optional[ArchitecturalScenarioResult]

# =============================================================================
# Baseline Graph Nodes
# =============================================================================

class BaselineGraphState(TypedDict):
    document_context: str
    baseline: Optional[ArchitecturalBaseline]

async def extract_baseline(state: BaselineGraphState) -> BaselineGraphState:
    service = LLMService()
    llm, _ = service._get_model("default")
    parser = PydanticOutputParser(pydantic_object=ArchitecturalBaseline)
    
    system_prompt = f"""You are an Enterprise Architect. Extract the baseline architectural topology from the provided context.
Identify the key components across Business, Information, Application, and Technology layers.
Assign a unique short ID to each.
Define edges representing dependencies. All status fields must be 'baseline'.

Document Context:
{state['document_context']}

Format instructions:
{parser.get_format_instructions()}
"""
    
    res = await llm.ainvoke([SystemMessage(content=system_prompt), HumanMessage(content="Extract the baseline architecture.")])
    try:
        return {"baseline": parser.invoke(res)}
    except Exception as e:
        logger.error(f"Failed to parse baseline: {e}")
        return {"baseline": ArchitecturalBaseline(nodes=[], edges=[])}

def build_baseline_extractor_graph() -> StateGraph:
    workflow = StateGraph(BaselineGraphState)
    workflow.add_node("extract_baseline", extract_baseline)
    workflow.set_entry_point("extract_baseline")
    workflow.add_edge("extract_baseline", END)
    return workflow.compile()

# =============================================================================
# Graph Nodes
# =============================================================================

async def parse_scenario(state: ScenarioGraphState) -> ScenarioGraphState:
    """Step A: Scenario & Intent Parsing Node"""
    service = LLMService()
    llm, _ = service._get_model("default")
    system_prompt = f"""You are an Enterprise Architect parsing an architectural intent.
Action: {state['action']}
Target Entity IDs: {state.get('target_entity_ids')}
Target Tech: {state['target_technology']}
Custom Prompt: {state['custom_prompt']}

Output a normalized mutation specification detailing exactly what components are added, removed, or changed."""
    
    res = await llm.ainvoke([SystemMessage(content=system_prompt), HumanMessage(content="Parse the intent.")])
    return {"mutation_spec": res.content}

async def traverse_topology(state: ScenarioGraphState) -> ScenarioGraphState:
    """Step B: Graph Dependency Traversal Node"""
    service = LLMService()
    llm, _ = service._get_model("default")
    system_prompt = f"""You are an Enterprise Architect traversing an architectural graph based on documents.
Document Context:
{state['document_context']}

Mutation Spec:
{state['mutation_spec']}

Identify all directly and transitively connected components across Business, Information, Application, and Technology layers."""
    
    res = await llm.ainvoke([SystemMessage(content=system_prompt), HumanMessage(content="Output the active subgraph of impacted components.")])
    return {"active_subgraph": res.content}

async def evaluate_cross_layer_impact(state: ScenarioGraphState) -> ScenarioGraphState:
    """Step C: Cross-Layer Impact & Risk Evaluation Node"""
    service = LLMService()
    llm, _ = service._get_model("default")
    system_prompt = f"""Evaluate cross-layer impacts and coupling risks.
Active Subgraph:
{state['active_subgraph']}
Mutation:
{state['mutation_spec']}

Identify protocol mismatches, broken data schemas, and lost capabilities. Output risk scores and broken interfaces."""
    
    res = await llm.ainvoke([SystemMessage(content=system_prompt), HumanMessage(content="Evaluate impacts.")])
    return {"impact_assessment": res.content}

async def synthesize_tobe_graph(state: ScenarioGraphState) -> ScenarioGraphState:
    """Step D: To-Be Graph Synthesis Node"""
    service = LLMService()
    llm, _ = service._get_model("default")
    system_prompt = f"""Synthesize the To-Be graph.
Baseline: {state.get('baseline')}
Impacts: {state['impact_assessment']}
Subgraph: {state['active_subgraph']}

Construct the To-Be graph in plain text. CRITICAL: You must preserve ALL existing nodes and edges from the Baseline that are unaffected. Only modify, remove, or add nodes as specified by the impacts. Do not drop unrelated components! Mark components as New, Removed, Modified, or Unchanged."""
    
    res = await llm.ainvoke([SystemMessage(content=system_prompt), HumanMessage(content="Synthesize To-Be Graph.")])
    return {"tobe_graph": res.content}

async def analyze_remediation_gaps(state: ScenarioGraphState) -> ScenarioGraphState:
    """Step E: Architectural Remediation & Gap Analysis Node"""
    service = LLMService()
    llm, _ = service._get_model("default")
    system_prompt = f"""Identify missing architectural middleware or adapters needed to fix broken dependencies.
To-Be Graph: {state['tobe_graph']}
Impacts: {state['impact_assessment']}"""
    
    res = await llm.ainvoke([SystemMessage(content=system_prompt), HumanMessage(content="Output gap analysis and remediation plan.")])
    return {"remediation_plan": res.content}

async def aggregate_json_spec(state: ScenarioGraphState) -> ScenarioGraphState:
    """Step F: JSON Spec Aggregator Node"""
    service = LLMService()
    llm, _ = service._get_model("default")
    parser = PydanticOutputParser(pydantic_object=ArchitecturalScenarioResult)
    
    system_prompt = f"""You are the final aggregator. Synthesize a JSON response conforming exactly to the schema.
Mutation: {state['mutation_spec']}
To-Be Graph: {state['tobe_graph']}
Impacts: {state['impact_assessment']}
Remediation: {state['remediation_plan']}
Baseline: {state.get('baseline')}

CRITICAL RULE: Your final JSON output MUST include ALL nodes and edges from the Baseline graph. 
- For nodes/edges unaffected by the scenario, copy them exactly as they are with status 'baseline'. 
- For nodes/edges that are changed, update their status to 'modified', 'removed', or add 'new' ones.
DO NOT drop any layers or components from the baseline just because they weren't impacted!

STRATEGIC ANALYSIS RULE:
1. ALWAYS use human-readable component labels (e.g. "Alfresco", "Service Orchestrator") in your descriptions. NEVER use internal IDs like "A4" or "D1".
2. You MUST provide a comprehensive, strategic "Enterprise Architect" level impact analysis organized by TOGAF ADM Phases (A, B, C, D, E, F, G, H, and R for Requirements Management). 
3. You MUST output an impact block for EVERY SINGLE PHASE (A, B, C, D, E, F, G, H, R). Never output "No comment". You must analyze and explain the strategic usability, project migration, and technical workflow impacts for all ADM phases even if components weren't directly touched.

Format instructions:
{parser.get_format_instructions()}
"""
    
    res = await llm.ainvoke([SystemMessage(content=system_prompt), HumanMessage(content="Generate the final JSON.")])
    
    try:
        parsed_result = parser.invoke(res)
        return {"result": parsed_result}
    except Exception as e:
        logger.error(f"Failed to parse LLM response: {e}")
        # Return fallback
        return {"result": ArchitecturalScenarioResult(
            nodes=[
                ScenarioNode(id="err1", label="Parse Error", layer="application", status="at_risk")
            ],
            edges=[],
            adm_impacts=[],
            structural_risk_score=100,
            structural_risk_rationale="Failed to parse LLM output.",
            financial_impact_estimate="Error",
            timeline_impact_estimate="Error"
        )}

def build_architectural_scenario_graph() -> StateGraph:
    workflow = StateGraph(ScenarioGraphState)
    
    workflow.add_node("parse_scenario", parse_scenario)
    workflow.add_node("traverse_topology", traverse_topology)
    workflow.add_node("evaluate_cross_layer_impact", evaluate_cross_layer_impact)
    workflow.add_node("synthesize_tobe_graph", synthesize_tobe_graph)
    workflow.add_node("analyze_remediation_gaps", analyze_remediation_gaps)
    workflow.add_node("aggregate_json_spec", aggregate_json_spec)
    
    workflow.set_entry_point("parse_scenario")
    
    workflow.add_edge("parse_scenario", "traverse_topology")
    workflow.add_edge("traverse_topology", "evaluate_cross_layer_impact")
    workflow.add_edge("evaluate_cross_layer_impact", "synthesize_tobe_graph")
    workflow.add_edge("synthesize_tobe_graph", "analyze_remediation_gaps")
    workflow.add_edge("analyze_remediation_gaps", "aggregate_json_spec")
    workflow.add_edge("aggregate_json_spec", END)
    
    return workflow.compile()
