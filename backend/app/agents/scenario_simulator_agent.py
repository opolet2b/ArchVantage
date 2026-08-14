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
    complexity: float = Field(description="Complexity factor (0.0 to 1.0)")
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

class ExtractedTopology(BaseModel):
    components: List[ArchitecturalComponent]
    dependencies: List[Dependency]
    overall_risk_score: float = Field(description="Overall perceived risk (0.0 to 1.0)")
    estimated_effort_weeks: int = Field(description="Total estimated effort in person-weeks")
    effort_citation: str = Field(description="Quote or explanation justifying the effort estimate.")
    extracted_variables: List[ExtractedVariable] = Field(description="Dynamic parameters and constraints explicitly found in the document.", default_factory=list)

class VariableConstraints(BaseModel):
    max_budget: float
    max_timeline_weeks: int
    max_staff: int
    dynamic_rules: Dict[str, float] = Field(default_factory=dict, description="Additional custom constraints extracted from the document or provided by the user.")

class ScheduledComponent(BaseModel):
    component_id: str
    start_week: int
    end_week: int
    assigned_staff: int
    is_bottleneck: bool = Field(default=False)

class SimulationResult(BaseModel):
    is_viable: bool
    schedule: List[ScheduledComponent]
    total_cost: float
    total_weeks: int
    bottleneck_analysis: str
    bottleneck_citation: str = Field(description="Explicit explanation of WHY this is a bottleneck, referencing the complexity, dependencies, or effort quotes from the extracted topology.")
    monthly_risk_indices: List[float] = Field(description="Compound risk score (0.0 - 1.0) for each month based on concurrent high-risk tasks.", default_factory=list)
    monthly_burn_rate: List[float] = Field(description="Total cost burned in each month.", default_factory=list)

class CopilotResponse(BaseModel):
    updated_constraints: VariableConstraints = Field(description="The new constraints updated based on the user's request.")
    assistant_reply: str = Field(description="A brief natural language response acknowledging the change.")

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
        SystemMessage(content="You are an expert Enterprise Architecture Document Parsing Agent. Your task is to extract architectural components, dependencies, risks, and effort estimates from the provided documents. Return the parsed topology.\n\nCRITICAL RULES:\n1. IDs MUST be human-readable names (e.g., 'Shared Biometric Service'), NOT obscure IDs (e.g., 'comp-sbms').\n2. You MUST extract dynamic variable constraints (budget, timeline, staff) if they exist in the text.\n3. You MUST provide direct quotes or section references in the 'source_citation' fields."),
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
        SystemMessage(content="You are an expert Architecture Constraint Solver. Given a topology (components and dependencies) and constraints (budget, timeline, staff, and custom dynamic rules), generate a viable schedule. Identify bottlenecks. If constraints are impossible, mark is_viable as false.\n\nCRITICAL RULES:\n1. You MUST provide a 'bottleneck_citation' that justifies WHY a bottleneck exists, explicitly referencing the complexity, effort, and dependency factors from the input topology.\n2. You MUST obey both the core constraints and any 'dynamic_rules' provided. If a dynamic rule limits concurrency, enforce it in your schedule.\n3. You MUST compute and return `monthly_risk_indices`: a list of compound risk scores (0-1.0) for each month. The length of this list MUST equal the total number of months (total_weeks / 4).\n4. You MUST compute and return `monthly_burn_rate`: a list of estimated cost burned per month. The length of this list MUST equal the total number of months."),
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
