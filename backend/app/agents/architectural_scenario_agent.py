import logging
import operator
from typing import TypedDict, List, Dict, Any, Optional, Annotated
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
    description: str = Field(description="Highly specific, concrete strategic analysis. MUST explicitly reference the user's custom prompt and the exact components involved. NEVER use generic boilerplate or invent unrelated architectural concepts (e.g. do not mention 'event-driven' unless explicitly in the prompt).")
    risk_level: str = Field(description="Low, Medium, High")

class ArchitecturalBaseline(BaseModel):
    nodes: List[ScenarioNode]
    edges: List[ScenarioEdge]

class ArchitecturalScenarioResult(BaseModel):
    nodes: List[ScenarioNode]
    edges: List[ScenarioEdge]
    adm_impacts: List[AdmPhaseImpact]
    structural_risk_score: int = Field(description="0 to 100")
    structural_risk_rationale: str = Field(description="A highly specific, concrete explanation justifying the risk score. You MUST explicitly name the components involved (e.g. 'Replacing Alfresco with Confluence') and cite exact scenario details. Do not use generic boilerplate text.")
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
    
    impacted_phases: Optional[List[str]]
    
    adm_impacts: Annotated[List[AdmPhaseImpact], operator.add]
    
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
Assign a unique short ID to each (e.g., A1, B2).
CRITICAL: When setting the 'label' for each node, you MUST prepend the ID to the name (e.g., "[A4] Content Server"). This ensures the ID is visible in the UI.
Define edges representing dependencies. All status fields must be 'baseline'.

Document Context:
{state['document_context']}

Format instructions:
{parser.get_format_instructions()}
"""
    
    res = await llm.ainvoke([SystemMessage(content=system_prompt), HumanMessage(content="Extract the baseline architecture.")])
    try:
        parsed = parser.invoke(res)
        updated_nodes = []
        for node in parsed.nodes:
            if not node.label.startswith(f"[{node.id}]"):
                updated_nodes.append(node.model_copy(update={'label': f"[{node.id}] {node.label}"}))
            else:
                updated_nodes.append(node)
        parsed.nodes = updated_nodes
        return {"baseline": parsed}
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
Baseline: {state.get('baseline')}

Output a normalized mutation specification detailing exactly what components are added, removed, or changed. You MUST use the Baseline graph to identify the names and properties of the components referenced by the Target Entity IDs. 
If the user requests to replace a component, explicitly state which baseline component is removed and what new component is added. Do not ignore the user's request."""
    
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

Identify the true architectural impacts. 
CRITICAL RULE: Base your analysis STRICTLY on the actual components being transformed (e.g. if the user swaps CMS tools like Alfresco and Confluence, focus on document management, content workflows, and user training). DO NOT hallucinate "REST calls", "eventual consistency", "event-driven architectures", "APIs", or "data schemas" unless they were explicitly part of the baseline or requested by the user. Do not invent technical complexity where none exists. Output realistic, scenario-grounded risk scores and impacts."""
    
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

Construct the To-Be graph in plain text. CRITICAL: You must preserve ALL existing nodes and edges from the Baseline that are unaffected. 
You MUST apply the changes from the Impacts and Subgraph. If a component is replaced, mark the old one as 'removed' and create the new one as 'new'. Do not ignore the replacement request!"""
    
    res = await llm.ainvoke([SystemMessage(content=system_prompt), HumanMessage(content="Synthesize To-Be Graph.")])
    return {"tobe_graph": res.content}

async def analyze_remediation_gaps(state: ScenarioGraphState) -> ScenarioGraphState:
    """Step E: Architectural Remediation & Gap Analysis Node"""
    service = LLMService()
    llm, _ = service._get_model("default")
    system_prompt = f"""Identify what needs to be done to successfully transition to the To-Be graph.
To-Be Graph: {state['tobe_graph']}
Impacts: {state['impact_assessment']}

CRITICAL RULE: DO NOT invent "middleware", "adapters", or "API gateways" unless they make sense for the specific components. If this is a business or software platform swap (like a CMS), focus on realistic remediation like user training, data migration, and capability mapping. Do not hallucinate irrelevant technical paradigms."""
    
    res = await llm.ainvoke([SystemMessage(content=system_prompt), HumanMessage(content="Output gap analysis and remediation plan.")])
    return {"remediation_plan": res.content}

class ImpactedPhases(BaseModel):
    phases: List[str] = Field(description="List of impacted phase letters, e.g. ['A', 'B', 'D']")

async def determine_impacted_phases(state: ScenarioGraphState) -> ScenarioGraphState:
    """Step E.5: Impact Router Node"""
    service = LLMService()
    llm, _ = service._get_model("default")
    parser = PydanticOutputParser(pydantic_object=ImpactedPhases)
    
    system_prompt = f"""You are an Enterprise Architect deciding which TOGAF phases are impacted by an architectural mutation.
Mutation: {state['mutation_spec']}
Impacts: {state['impact_assessment']}

Review the mutation and impacts. Decide which of the following TOGAF phases require detailed analysis:
A: Architecture Vision
B: Business Architecture
C: Information Systems Architecture
D: Technology Architecture
E: Opportunities & Solutions
F: Migration Planning
G: Implementation Governance
H: Architecture Change Management
R: Requirements Management

Return ONLY the letters of the phases that are meaningfully impacted. Do not return all phases unless absolutely necessary.
Format instructions:
{parser.get_format_instructions()}
"""
    res = await llm.ainvoke([SystemMessage(content=system_prompt), HumanMessage(content="Determine impacted phases.")])
    try:
        parsed = parser.invoke(res)
        valid_phases = ["A", "B", "C", "D", "E", "F", "G", "H", "R"]
        impacted = [p for p in parsed.phases if p in valid_phases]
        if not impacted:
            impacted = ["A"] # fallback
        return {"impacted_phases": impacted}
    except Exception as e:
        logger.error(f"Failed to parse impacted phases: {e}")
        return {"impacted_phases": ["A", "B", "C", "D"]} # fallback

async def analyze_adm_phase(state: ScenarioGraphState, phase_name: str, phase_desc: str) -> dict:
    service = LLMService()
    llm, _ = service._get_model("default")
    parser = PydanticOutputParser(pydantic_object=AdmPhaseImpact)
    
    system_prompt = f"""You are an Expert Enterprise Architect analyzing the strategic impact of an architectural transformation.
Focus EXCLUSIVELY on TOGAF {phase_name}: {phase_desc}.

Mutation: {state['mutation_spec']}
To-Be Graph: {state['tobe_graph']}
Remediation Plan: {state['remediation_plan']}

Provide a deeply detailed, comprehensive analysis of how the target scenario impacts this specific phase. Provide concrete examples based on the mutation. Do not summarize—provide professional depth. Explicitly name the components being added or removed.

Format instructions:
{parser.get_format_instructions()}
"""
    res = await llm.ainvoke([SystemMessage(content=system_prompt), HumanMessage(content=f"Analyze {phase_name}.")])
    try:
        impact = parser.invoke(res)
        # Force the phase field to be correct just in case the LLM messes it up
        impact.phase = f"{phase_name[-1]} ({phase_desc})"
        return {"adm_impacts": [impact]}
    except Exception as e:
        logger.error(f"Failed to parse ADM impact for {phase_name}: {e}")
        return {"adm_impacts": []}

async def analyze_phase_A(state): return await analyze_adm_phase(state, "Phase A", "Architecture Vision")
async def analyze_phase_B(state): return await analyze_adm_phase(state, "Phase B", "Business Architecture")
async def analyze_phase_C(state): return await analyze_adm_phase(state, "Phase C", "Information Systems Architecture")
async def analyze_phase_D(state): return await analyze_adm_phase(state, "Phase D", "Technology Architecture")
async def analyze_phase_E(state): return await analyze_adm_phase(state, "Phase E", "Opportunities & Solutions")
async def analyze_phase_F(state): return await analyze_adm_phase(state, "Phase F", "Migration Planning")
async def analyze_phase_G(state): return await analyze_adm_phase(state, "Phase G", "Implementation Governance")
async def analyze_phase_H(state): return await analyze_adm_phase(state, "Phase H", "Architecture Change Management")
async def analyze_phase_R(state): return await analyze_adm_phase(state, "Phase R", "Requirements Management")

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
Ensure you successfully apply the requested transformations from the To-Be Graph. If the To-Be Graph says a component is replaced, you MUST output the new component in the JSON.

STRATEGIC ANALYSIS RULE:
1. ALWAYS use human-readable component labels (e.g. "Alfresco", "Service Orchestrator") in your descriptions. NEVER use internal IDs like "A4" or "D1".

Format instructions:
{parser.get_format_instructions()}
"""
    
    res = await llm.ainvoke([SystemMessage(content=system_prompt), HumanMessage(content="Generate the final JSON.")])
    
    try:
        parsed_result = parser.invoke(res)
        updated_nodes = []
        for node in parsed_result.nodes:
            if not node.label.startswith(f"[{node.id}]"):
                updated_nodes.append(node.model_copy(update={'label': f"[{node.id}] {node.label}"}))
            else:
                updated_nodes.append(node)
        parsed_result.nodes = updated_nodes
        parsed_result.adm_impacts = state.get('adm_impacts', [])
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
    workflow.add_node("determine_impacted_phases", determine_impacted_phases)
    
    # Phase specific nodes
    phases = ["A", "B", "C", "D", "E", "F", "G", "H", "R"]
    workflow.add_node("analyze_phase_A", analyze_phase_A)
    workflow.add_node("analyze_phase_B", analyze_phase_B)
    workflow.add_node("analyze_phase_C", analyze_phase_C)
    workflow.add_node("analyze_phase_D", analyze_phase_D)
    workflow.add_node("analyze_phase_E", analyze_phase_E)
    workflow.add_node("analyze_phase_F", analyze_phase_F)
    workflow.add_node("analyze_phase_G", analyze_phase_G)
    workflow.add_node("analyze_phase_H", analyze_phase_H)
    workflow.add_node("analyze_phase_R", analyze_phase_R)
    
    workflow.add_node("aggregate_json_spec", aggregate_json_spec)
    
    workflow.set_entry_point("parse_scenario")
    
    workflow.add_edge("parse_scenario", "traverse_topology")
    workflow.add_edge("traverse_topology", "evaluate_cross_layer_impact")
    workflow.add_edge("evaluate_cross_layer_impact", "synthesize_tobe_graph")
    workflow.add_edge("synthesize_tobe_graph", "analyze_remediation_gaps")
    workflow.add_edge("analyze_remediation_gaps", "determine_impacted_phases")
    
    def route_to_phases(state: ScenarioGraphState) -> List[str]:
        impacted = state.get('impacted_phases', [])
        if not impacted:
            return ["aggregate_json_spec"]
        return [f"analyze_phase_{p}" for p in impacted]

    # Map possible routing destinations
    path_map = {f"analyze_phase_{p}": f"analyze_phase_{p}" for p in phases}
    path_map["aggregate_json_spec"] = "aggregate_json_spec"

    # Dynamic Conditional Fan-out
    workflow.add_conditional_edges(
        "determine_impacted_phases",
        route_to_phases,
        path_map
    )
        
    # Fan in
    for phase in phases:
        workflow.add_edge(f"analyze_phase_{phase}", "aggregate_json_spec")
        
    workflow.add_edge("aggregate_json_spec", END)
    
    return workflow.compile()
