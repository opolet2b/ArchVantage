import logging
from typing import TypedDict, List, Dict, Any, Optional
from langgraph.graph import StateGraph, END
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_core.output_parsers import PydanticOutputParser
from pydantic import BaseModel, Field

from app.services.llm_service import LLMService

logger = logging.getLogger(__name__)

# =============================================================================
# Schemas
# =============================================================================

class ArchitecturalComponent(BaseModel):
    id: str = Field(description="Human-readable ID (e.g., 'Core Database', 'Auth Service'). DO NOT use obscure technical IDs like 'comp-mid'.")
    name: str = Field(description="Full name of the component")
    type: str = Field(description="Type of component (e.g., Database, API, Frontend, Identity Provider)")
    technical_complexity: float = Field(default=0.5, description="How hard is it to code and build? (0.0 to 1.0)")
    operational_complexity: float = Field(default=0.5, description="How hard is it to deploy and maintain? (0.0 to 1.0)")
    compliance_risk: float = Field(default=0.5, description="Does it handle PII or have regulatory constraints? (0.0 to 1.0)")
    required_roles: List[str] = Field(description="Roles required (e.g., DevOps, Backend, Cloud Architect)")
    source_citation: str = Field(description="Exact quote, page, or section from the document that justifies this component and its complexity. If inferred, explain why.")

class Dependency(BaseModel):
    source_id: str = Field(description="ID of the component that depends on another")
    target_id: str = Field(description="ID of the component being depended on")
    type: str = Field(description="Type of dependency (e.g., Data, Execution, Infrastructure)")

class ExtractedVariable(BaseModel):
    name: str = Field(description="Name of the parameter (e.g., 'Max Budget', 'Hard Deadline', 'FTE Allocation')")
    value: float = Field(description="Numeric value extracted")
    unit: str = Field(description="Unit (e.g., 'USD', 'Months', 'FTEs')")
    source_citation: str = Field(description="Quote or section from the document where this parameter is defined.")

class ExtractedTeam(BaseModel):
    id: str = Field(description="Unique ID for the team (e.g., 'core_cbs')")
    name: str = Field(description="Display name of the team")
    source: str = Field(description="The source document where this team was mentioned")
    description: str = Field(description="Brief description of the team's capabilities and domain knowledge")
    technical_capability_score: int = Field(default=50, description="An estimated score from 0 to 100 indicating this team's technical software engineering and architecture proficiency. (e.g., Procurement = 5, Platform Engineering = 95).")

class ExtractedTopology(BaseModel):
    components: List[ArchitecturalComponent]
    dependencies: List[Dependency]
    overall_risk_score: float = Field(description="Overall perceived risk (0.0 to 1.0)")
    estimated_effort_weeks: int = Field(description="Total estimated effort in person-weeks")
    effort_citation: str = Field(description="Quote or explanation justifying the effort estimate.")
    extracted_variables: List[ExtractedVariable] = Field(description="Dynamic parameters and constraints explicitly found in the document.", default_factory=list)
    extracted_teams: List[ExtractedTeam] = Field(description="Organizational teams mentioned in the documents.", default_factory=list)

class VariableConstraints(BaseModel):
    max_budget: float
    max_timeline_weeks: int
    max_staff: int
    target_components: List[str] = Field(default_factory=list, description="The components being mutated or targeted")
    migration_pattern: str = Field(default="", description="Migration pattern to apply (e.g., strangler_fig, point_to_point)")
    interface_protocols: Dict[str, str] = Field(default_factory=dict, description="Mapping of dependency edges (e.g., 'source_id->target_id') to specific interface protocols.")
    team_assignee: str = Field(default="", description="The team assigned to the migration")
    dual_run: bool = Field(default=False, description="Whether to enable dual-run replication")
    zero_downtime: bool = Field(default=False, description="Whether to require zero-downtime cutover")
    canary_rollout: bool = Field(default=False, description="Whether to require canary rollout")
    data_backfill: bool = Field(default=False, description="Whether to require data backfill")
    dynamic_rules: Dict[str, float] = Field(default_factory=dict, description="Additional custom constraints extracted from the document or provided by the user.")

class ScheduledComponent(BaseModel):
    component_id: str
    start_week: int
    end_week: int
    assigned_staff: int
    is_bottleneck: bool = Field(default=False)

class SimulationAssumption(BaseModel):
    description: str = Field(description="The assumption made (e.g., 'Integration Layer requires 75% of total effort').")
    document_name: str = Field(description="Name of the source document.")
    page_number: str = Field(description="Page number or section.")
    exact_extract: str = Field(description="Exact quote or extract from the document supporting this.")

class IsolatedImpact(BaseModel):
    total_cost: float
    total_weeks: int
    risk_index: float
    bottleneck_analysis: str
    justification_of_metrics: str = Field(description="Detailed explanation of how the time, budget, and risk index were calculated.")
    assumptions: List[SimulationAssumption] = Field(description="References for assumptions made in these isolated metrics.", default_factory=list)

class SimulationResult(BaseModel):
    is_viable: bool
    schedule: List[ScheduledComponent]
    total_cost: float
    total_weeks: int
    bottleneck_analysis: str
    bottleneck_citation: str = Field(description="Explicit explanation of WHY this is a bottleneck, referencing the complexity, dependencies, or effort quotes from the extracted topology.")
    monthly_risk_indices: List[float] = Field(description="Compound risk score (0.0 - 1.0) for each month based on concurrent high-risk tasks.", default_factory=list)
    monthly_burn_rate: List[float] = Field(description="Total cost burned in each month.", default_factory=list)
    justification_of_metrics: str = Field(description="Detailed explanation of how the cumulative time, budget, and risk index were calculated.", default="No justification provided.")
    assumptions: List[SimulationAssumption] = Field(description="References for assumptions made in these cumulative metrics.", default_factory=list)
    isolated_impacts: Dict[str, IsolatedImpact] = Field(
        description="Isolated impact analysis for each category if only those specific changes were applied. Keys must be 'topology', 'org', 'strategy', 'pnl'.",
        default_factory=dict
    )

class CopilotResponse(BaseModel):
    updated_constraints: VariableConstraints = Field(description="The new constraints updated based on the user's request.")
    assistant_reply: str = Field(description="A brief natural language response acknowledging the change.")

class AutoSolveResponse(BaseModel):
    optimal_constraints: VariableConstraints = Field(description="The optimal parameters that satisfy the constraints.")
    optimal_simulation: SimulationResult = Field(description="The resulting simulation metrics and schedule.")

# =============================================================================
# State Definition
# =============================================================================
class DocParserState(TypedDict):
    documents: List[str]
    llm_preset: Optional[str]
    topology: Optional[ExtractedTopology]
    errors: List[str]

class ConstraintSolverState(TypedDict):
    topology: ExtractedTopology
    constraints: VariableConstraints
    llm_preset: Optional[str]
    simulation_result: Optional[SimulationResult]
    errors: List[str]

class AutoSolveState(TypedDict):
    topology: ExtractedTopology
    target_components: List[str]
    max_budget: float
    max_timeline_weeks: int
    max_staff: int
    llm_preset: Optional[str]
    auto_solve_response: Optional[AutoSolveResponse]
    errors: List[str]

# =============================================================================
# Nodes
# =============================================================================

def get_llm(state: DocParserState):
    service = LLMService()
    preset = state.get("llm_preset", "default")
    llm, _ = service._get_model(preset)
    return llm

def invoke_with_fallback(llm, schema_class, messages):
    parser = PydanticOutputParser(pydantic_object=schema_class)
    format_instructions = parser.get_format_instructions()
    
    last_msg = messages[-1]
    last_msg.content = f"{last_msg.content}\n\n{format_instructions}"
    
    response = llm.invoke(messages)
    
    try:
        return parser.parse(response.content)
    except Exception as e:
        logger.warning(f"Initial parse failed: {e}. Trying to strip markdown.")
        try:
            content = response.content.replace("```json", "").replace("```", "").strip()
            return parser.parse(content)
        except Exception as e2:
            logger.error(f"Fallback parse failed: {e2}")
            raise e2

def extract_topology_node(state: DocParserState):
    logger.info("Extracting topology from documents...")
    llm = get_llm(state)
    
    docs_text = "\n\n".join(state.get("documents", []))
    
    messages = [
        SystemMessage(content="You are an expert Enterprise Architecture Document Parsing Agent. Your task is to extract architectural components, dependencies, risks, organizational teams, and effort estimates from the provided documents. Return the parsed topology.\n\nCRITICAL RULES:\n1. IDs MUST be human-readable names (e.g., 'Shared Biometric Service'), NOT obscure IDs.\n2. You MUST extract dynamic variable constraints (budget, timeline, staff) if they exist.\n3. You MUST extract organizational teams mentioned in the documents into 'extracted_teams'.\n4. You MUST provide direct quotes or section references in the 'source_citation' or 'source' fields."),
        HumanMessage(content=f"Please analyze these architecture documents and extract the topology.\n\nDocuments:\n{docs_text}")
    ]
    
    try:
        topology = invoke_with_fallback(llm, ExtractedTopology, messages)
        return {"topology": topology}
    except Exception as e:
        logger.error(f"Error in extract_topology_node: {e}")
        return {"errors": state.get("errors", []) + [str(e)]}

# =============================================================================
# Graph Definition
# =============================================================================
def build_doc_parser_graph():
    workflow = StateGraph(DocParserState)
    
    workflow.add_node("extract_topology", extract_topology_node)
    
    workflow.set_entry_point("extract_topology")
    workflow.add_edge("extract_topology", END)
    
    return workflow.compile()

def solve_constraints_node(state: ConstraintSolverState):
    logger.info("Solving constraints for simulation...")
    service = LLMService()
    preset = state.get("llm_preset", "default")
    llm, _ = service._get_model(preset)
    
    topology_json = state["topology"].model_dump_json()
    constraints_json = state["constraints"].model_dump_json()
    
    messages = [
        SystemMessage(content="You are an expert Architecture Constraint Solver. Given a topology (components and dependencies) and constraints (budget, timeline, staff, and custom dynamic rules), generate a viable schedule. Identify bottlenecks. If constraints are impossible, mark is_viable as false.\n\nCRITICAL RULES:\n1. You MUST provide a 'bottleneck_citation' that justifies WHY a bottleneck exists, explicitly referencing the complexity, effort, and dependency factors from the input topology.\n2. You MUST obey both the core constraints and any 'dynamic_rules' provided. If a dynamic rule limits concurrency, enforce it in your schedule.\n3. You MUST compute and return `monthly_risk_indices`: a list of compound risk scores (0-1.0) for each month. The length of this list MUST equal the total number of months (total_weeks / 4).\n4. You MUST compute and return `monthly_burn_rate`: a list of estimated cost burned per month. The length of this list MUST equal the total number of months.\n5. You MUST populate `isolated_impacts` with simulated isolated effects for 'topology', 'org', 'strategy', and 'pnl'. VERY IMPORTANT: Each isolated impact MUST be unique and specifically evaluate ONLY its domain. DO NOT copy-paste the same response across tabs. DO NOT hallucinate that a constraint is enabled if the boolean is explicitly False in the constraints. IMPORTANT: In the 'topology' evaluation, ONLY mention and evaluate the specific components listed in `target_components`. Do NOT hallucinate that other components (like Integration Layer) are targeted if they are not in the list.\n6. You MUST provide a clear 'justification_of_metrics' for both the cumulative result and each isolated impact. VERY IMPORTANT: You MUST start your justification by explicitly stating your assumptions based on the user's inputs using this format: 'Based on your selection of [X], I assumed [Y]...'. Explain exactly why you assigned specific complexities.\n7. You MUST provide references for your metrics assumptions by populating the 'assumptions' list. CRITICAL: DO NOT hallucinate fake industry books or manuals. ONLY cite the source documents actually provided in the `topology` input.\n8. CRITICAL: You MUST populate the `schedule` array with at least one `ScheduledComponent` mapping out the start and end weeks of the execution. It cannot be empty!\n9. NOTE: Do not worry about perfectly calculating `total_cost` and `total_weeks` in your response. We will overwrite these fields deterministically in Python using the start/end weeks and assigned_staff counts you generate in the schedule array.\n10. CRITICAL: The `migration_pattern` applies ONLY to the specific components listed in `target_components`. The `interface_protocols` constraint dictates specific protocol changes for specific edge dependencies. Do NOT apply these mutations globally to the entire architecture."),
        HumanMessage(content=f"Topology:\n{topology_json}\n\nConstraints:\n{constraints_json}")
    ]
    
    try:
        result = invoke_with_fallback(llm, SimulationResult, messages)
        return {"simulation_result": result}
    except Exception as e:
        logger.error(f"Error in solve_constraints_node: {e}")
        return {"errors": state.get("errors", []) + [str(e)]}

def build_constraint_solver_graph():
    workflow = StateGraph(ConstraintSolverState)
    workflow.add_node("solve_constraints", solve_constraints_node)
    workflow.set_entry_point("solve_constraints")
    workflow.add_edge("solve_constraints", END)
    return workflow.compile()

class CopilotState(TypedDict):
    user_message: str
    current_constraints: VariableConstraints
    llm_preset: Optional[str]
    copilot_response: Optional[CopilotResponse]
    errors: List[str]

def copilot_node(state: CopilotState):
    logger.info("Running copilot to update constraints...")
    service = LLMService()
    preset = state.get("llm_preset", "default")
    llm, _ = service._get_model(preset)
    
    constraints_json = state["current_constraints"].model_dump_json()
    
    messages = [
        SystemMessage(content="You are an Interactive Conversational Copilot for an Architecture Simulator. Your job is to interpret the user's 'What if...' question, apply the requested changes to the current constraints (Budget, Timeline, Staff), and return the updated constraints along with a brief, helpful reply."),
        HumanMessage(content=f"Current Constraints:\n{constraints_json}\n\nUser Request: {state['user_message']}")
    ]
    
    try:
        result = invoke_with_fallback(llm, CopilotResponse, messages)
        return {"copilot_response": result}
    except Exception as e:
        logger.error(f"Error in copilot_node: {e}")
        return {"errors": state.get("errors", []) + [str(e)]}

def build_copilot_graph():
    workflow = StateGraph(CopilotState)
    workflow.add_node("copilot", copilot_node)
    workflow.set_entry_point("copilot")
    workflow.add_edge("copilot", END)
    return workflow.compile()

def auto_solve_node(state: AutoSolveState):
    logger.info("Running AutoSolve agent...")
    service = LLMService()
    preset = state.get("llm_preset", "default")
    llm, _ = service._get_model(preset)
    
    topology_json = state["topology"].model_dump_json()
    
    messages = [
        SystemMessage(content="You are an expert Architecture Auto-Solver Agent. Given a topology and maximum constraints (Budget, Timeline, Staff), your job is to find the optimal combination of parameters (migration_pattern, team_assignee, dual_run, canary_rollout, zero_downtime, data_backfill) that keeps the execution within budget and on time, while minimizing risk. Return both the 'optimal_constraints' you decided on, and the resulting 'optimal_simulation' (the schedule and metrics justification). Use realistic values that strictly obey the maximum constraints.\n\nCRITICAL RULES:\n1. migration_pattern MUST be one of: [do_nothing, strangler_fig, branch_by_abstraction, parallel_run, cdc, facade, lift_shift, point_to_point, big_bang]\n2. team_assignee MUST be one of: [do_nothing, platform_squad, legacy_domain, external_contractor, devops_sre, tiger_team, offshore_team] OR match an ID from the extracted_teams in the topology.\n3. The schedule array MUST NOT be empty."),
        HumanMessage(content=f"Topology:\n{topology_json}\n\nTarget Components: {state['target_components']}\nMax Budget: {state['max_budget']}\nMax Timeline Weeks: {state['max_timeline_weeks']}\nMax Staff: {state['max_staff']}")
    ]
    
    try:
        result = invoke_with_fallback(llm, AutoSolveResponse, messages)
        return {"auto_solve_response": result}
    except Exception as e:
        logger.error(f"Error in auto_solve_node: {e}")
        return {"errors": state.get("errors", []) + [str(e)]}

def build_auto_solve_graph():
    workflow = StateGraph(AutoSolveState)
    workflow.add_node("auto_solve", auto_solve_node)
    workflow.set_entry_point("auto_solve")
    workflow.add_edge("auto_solve", END)
    return workflow.compile()
