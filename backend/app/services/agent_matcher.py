"""
Agent Matcher Service

Service to match user chat requests against available agent blueprints.
Uses LLM to intelligently determine which agents can handle a given request.
"""
from typing import Any, Dict, List, Optional
from dataclasses import dataclass
from sqlalchemy.orm import Session

from app.models.agent_blueprint import AgentBlueprint
from app.services.llm_service import llm_service


@dataclass
class AgentMatch:
    """Result of matching a request to an agent."""
    agent_id: str
    agent_name: str
    agent_description: str
    confidence: float  # 0.0 to 1.0
    reason: str
    inputs_schema: Dict[str, Any]


class AgentMatcherService:
    """
    Service to match user requests against available agent blueprints.
    
    Uses the LLM to analyze a user's message and determine which
    agents from the available pool can best handle the request.
    """
    
    async def match_request_to_agents(
        self,
        message: str,
        db: Session,
        user_id: int,
        top_k: int = 3,
        min_confidence: float = 0.5
    ) -> List[AgentMatch]:
        """
        Match a user message to available agents.
        
        Args:
            message: The user's chat message.
            db: Database session.
            user_id: ID of the current user.
            top_k: Maximum number of matches to return.
            min_confidence: Minimum confidence threshold (0.0-1.0).
            
        Returns:
            List of AgentMatch results sorted by confidence (descending).
        """
        # Get available agents for this user
        agents = db.query(AgentBlueprint).filter(
            (AgentBlueprint.owner_id == user_id) |
            (AgentBlueprint.is_published == True)
        ).all()
        
        if not agents:
            return []
        
        # Build agent descriptions for the LLM prompt
        agent_info = []
        for agent in agents:
            agent_info.append({
                "id": agent.id,
                "name": agent.name,
                "description": agent.description or "No description provided",
                "inputs_schema": agent.inputs_schema or {}
            })
        
        # Create the matching prompt
        agents_json = "\n".join([
            f"- ID: {a['id']}\n  Name: {a['name']}\n  Description: {a['description']}"
            for a in agent_info
        ])
        
        system_prompt = """You are an agent matching assistant. Your task is to analyze a user's request and determine which agents from the available pool can handle it.

For each matching agent, provide:
1. agent_id: The ID of the matching agent
2. confidence: A score from 0.0 to 1.0 indicating how well the agent matches
3. reason: A brief explanation of why this agent matches

Respond in JSON format:
{
  "matches": [
    {"agent_id": "...", "confidence": 0.85, "reason": "..."},
    ...
  ]
}

If no agents match the request, respond with: {"matches": []}"""

        user_prompt = f"""User Request: {message}

Available Agents:
{agents_json}

Analyze which agents can handle this request."""

        try:
            # Call LLM for matching
            response = await llm_service.chat(
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                model="default"
            )
            
            # Parse response
            import json
            import re
            
            # Try to extract JSON from response
            json_match = re.search(r'\{[\s\S]*\}', response)
            if not json_match:
                return []
            
            result = json.loads(json_match.group())
            matches = result.get("matches", [])
            
            # Build AgentMatch objects
            agent_dict = {a["id"]: a for a in agent_info}
            agent_matches = []
            
            for match in matches:
                agent_id = match.get("agent_id")
                confidence = float(match.get("confidence", 0))
                
                if agent_id not in agent_dict:
                    continue
                if confidence < min_confidence:
                    continue
                
                agent = agent_dict[agent_id]
                agent_matches.append(AgentMatch(
                    agent_id=agent_id,
                    agent_name=agent["name"],
                    agent_description=agent["description"],
                    confidence=confidence,
                    reason=match.get("reason", ""),
                    inputs_schema=agent["inputs_schema"]
                ))
            
            # Sort by confidence and limit to top_k
            agent_matches.sort(key=lambda x: x.confidence, reverse=True)
            return agent_matches[:top_k]
            
        except Exception as e:
            print(f"Agent matching error: {e}")
            return []

    def extract_inputs_from_message(
        self,
        message: str,
        inputs_schema: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Try to extract input values from the user's message.
        
        This is a simple extraction that looks for quoted strings
        and keywords matching input names.
        
        Args:
            message: The user's chat message.
            inputs_schema: The agent's inputs schema.
            
        Returns:
            Dictionary of extracted input values.
        """
        extracted = {}
        properties = inputs_schema.get("properties", {})
        
        # Simple extraction: use the entire message as first string input
        for prop_name, prop_schema in properties.items():
            prop_type = prop_schema.get("type", "string")
            if prop_type == "string" and prop_name not in extracted:
                # Use message as the first string input
                extracted[prop_name] = message
                break
        
        return extracted


# Singleton instance
agent_matcher = AgentMatcherService()
