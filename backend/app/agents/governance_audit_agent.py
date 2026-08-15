import logging
from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field
from langgraph.graph import StateGraph, END
from typing_extensions import TypedDict
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_core.output_parsers import PydanticOutputParser

from app.services.llm_service import LLMService

logger = logging.getLogger(__name__)

class Rule(BaseModel):
    id: str = Field(description="Unique identifier for the rule (e.g., R1)")
    name: str = Field(description="Short, descriptive name of the rule")
    description: str = Field(description="Detailed explanation of the rule condition")
    domain: str = Field(description="Architecture domain (e.g., Security, Data Protection, Resilience)")

class DocumentInput(BaseModel):
    title: str
    text: str

class RuleEvaluation(BaseModel):
    rule_id: str = Field(description="ID of the rule being evaluated")
    compliant: bool = Field(description="Whether the architecture is compliant with this rule")
    score: int = Field(description="Compliance score for this rule (0-100, typically 100 for compliant, 0 for non-compliant)")
    explanation: str = Field(description="Detailed explanation of how the rule is covered (if compliant) or why it is not (if non-compliant)")
    remediation: Optional[str] = Field(description="Suggested remediation to fix the issue (if non-compliant)", default=None)
    references: List[str] = Field(description="Quotes from the TARGET ARCHITECTURE documents proving compliance or non-compliance. Format: '[Document Name, Page X] Quote text'")

class GuardrailParsingResult(BaseModel):
    rules: List[Rule]

class ComplianceVerificationResult(BaseModel):
    evaluations: List[RuleEvaluation]

class GovernanceAuditState(TypedDict):
    guardrail_docs: List[Dict[str, str]]
    architecture_docs: List[Dict[str, str]]
    llm_preset: str
    parsed_rules: List[Rule]
    evaluations: List[RuleEvaluation]
    final_results: Dict[str, Any]
    errors: List[str]

def get_llm(state: GovernanceAuditState):
    service = LLMService()
    preset = state.get("llm_preset", "default")
    llm, _ = service._get_model(preset)
    return llm

def invoke_with_fallback(llm, schema_class, messages):
    parser = PydanticOutputParser(pydantic_object=schema_class)
    format_instructions = parser.get_format_instructions()
    
    last_msg = messages[-1].content
    if isinstance(last_msg, str):
        messages[-1].content = f"{last_msg}\n\n{format_instructions}"
    
    try:
        response = llm.invoke(messages)
        return parser.parse(response.content)
    except Exception as e:
        logger.warning(f"Failed to parse or invoke LLM: {e}. Returning empty/default.")
        # In a production scenario, we'd have robust retry/fallback here.
        raise

def guardrail_parser_node(state: GovernanceAuditState):
    """Phase 1: Extracts discrete, testable logic rules from natural text guardrail documents."""
    llm = get_llm(state)
    
    docs = state.get("guardrail_docs", [])
    guardrail_text = "\n\n".join([f"--- DOCUMENT: {doc.get('title', 'Unknown')} ---\n{doc.get('text', '')}" for doc in docs])
    
    if not guardrail_text.strip():
        return {"parsed_rules": [], "errors": ["No guardrail documents provided."]}
        
    prompt = f"""
    You are an Enterprise Architecture Governance auditor.
    Analyze the following governance and compliance policy text.
    Extract all distinct, enforceable rules or guardrails that a target architecture must follow.
    
    Policy Text:
    {guardrail_text}
    """
    
    messages = [HumanMessage(content=prompt)]
    try:
        result = invoke_with_fallback(llm, GuardrailParsingResult, messages)
        return {"parsed_rules": result.rules}
    except Exception as e:
        return {"errors": [f"Guardrail parsing failed: {str(e)}"]}

def arch_model_extractor_node(state: GovernanceAuditState):
    """Phase 2: Parses target architecture inputs. (Stubbed out for LLM analysis for now)"""
    # In the future, this would parse ArchiMate XML into a unified Graph schema.
    # For now, we will pass the raw architecture text to the compliance verifier.
    return {}

def compliance_verifier_node(state: GovernanceAuditState):
    """Phase 3: Evaluates the architecture against the parsed rules."""
    llm = get_llm(state)
    rules = state.get("parsed_rules", [])
    
    docs = state.get("architecture_docs", [])
    arch_text = "\n\n".join([f"--- TARGET ARCHITECTURE DOCUMENT: {doc.get('title', 'Unknown')} ---\n{doc.get('text', '')}" for doc in docs])
    
    if not rules or not arch_text.strip():
        return {"violations": [], "compliant_rule_ids": []}
        
    rules_json = "\n".join([f"- [{r.id}] {r.name}: {r.description}" for r in rules])
    
    prompt = f"""
    You are an Enterprise Architecture Governance auditor.
    Evaluate the target architecture against the following governance rules.
    
    Rules to verify:
    {rules_json}
    
    Target Architecture Documents (Source of Truth):
    {arch_text}
    
    For EVERY rule, determine if it is compliant or violated.
    Provide a detailed explanation for BOTH compliant and non-compliant rules.
    CRITICAL INSTRUCTION FOR REFERENCES:
    Your references MUST ONLY come from the Target Architecture Documents provided above. Do NOT quote the rule definition or the guardrail policy.
    Extract specific citations or quotes from the Target Architecture Documents to justify your assessment. 
    Format each reference EXACTLY like this: "[Document Title, Page X] The exact quote from the document". If page is unknown, just use the document title.
    """
    
    messages = [HumanMessage(content=prompt)]
    try:
        result = invoke_with_fallback(llm, ComplianceVerificationResult, messages)
        return {
            "evaluations": result.evaluations
        }
    except Exception as e:
        return {"errors": [f"Compliance verification failed: {str(e)}"]}

def report_synthesizer_node(state: GovernanceAuditState):
    """Phase 4: Consolidates findings into the final result format expected by the frontend."""
    rules = state.get("parsed_rules", [])
    evaluations = state.get("evaluations", [])
    
    final_rules = []
    total_score = 0
    
    for rule in rules:
        evaluation = next((e for e in evaluations if e.rule_id == rule.id), None)
        if evaluation:
            final_rules.append({
                "id": rule.id,
                "name": rule.name,
                "score": evaluation.score,
                "compliant": evaluation.compliant,
                "explanation": evaluation.explanation,
                "remediation": evaluation.remediation,
                "references": evaluation.references
            })
            total_score += evaluation.score
        else:
            # Rule could not be evaluated
            final_rules.append({
                "id": rule.id,
                "name": rule.name,
                "score": 0,
                "compliant": False,
                "explanation": "Unable to evaluate this rule against the provided architecture context.",
                "remediation": "Provide more detailed architecture documentation.",
                "references": []
            })
            total_score += 0
            
    overall_score = (total_score // len(rules)) if rules else 0
    
    return {
        "final_results": {
            "overallScore": overall_score,
            "rules": final_rules
        }
    }

def build_governance_audit_graph():
    workflow = StateGraph(GovernanceAuditState)
    
    workflow.add_node("guardrail_parser", guardrail_parser_node)
    workflow.add_node("arch_model_extractor", arch_model_extractor_node)
    workflow.add_node("compliance_verifier", compliance_verifier_node)
    workflow.add_node("report_synthesizer", report_synthesizer_node)
    
    workflow.set_entry_point("guardrail_parser")
    workflow.add_edge("guardrail_parser", "arch_model_extractor")
    workflow.add_edge("arch_model_extractor", "compliance_verifier")
    workflow.add_edge("compliance_verifier", "report_synthesizer")
    workflow.add_edge("report_synthesizer", END)
    
    return workflow.compile()
