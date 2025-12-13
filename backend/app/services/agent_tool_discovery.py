"""
Agent Tool Discovery

RAG-based tool discovery for finding relevant tools when building agents.
Uses semantic search to match user queries with available tools.
"""
from typing import List, Optional, Dict, Any
from app.services.rag_service import rag_service


class AgentToolDiscovery:
    """
    Discovers relevant tools for agent building using semantic search.
    
    Tools are indexed with enriched text including name, description,
    function signatures, and synthetic example questions.
    """
    
    def __init__(self):
        self.collection_name = "agent_tools"
    
    def _build_enriched_text(self, tool) -> str:
        """
        Build enriched text representation of a tool for embedding.
        
        Includes name, description, functions, and example use cases.
        """
        parts = [
            f"Tool Name: {tool.name}",
            f"Description: {tool.description or 'No description'}"
        ]
        
        # Add function information from configuration
        config = tool.configuration or {}
        selected_functions = config.get("selected_functions", [])
        
        if selected_functions:
            parts.append("Functions:")
            for func in selected_functions:
                func_name = func.get("name", "unknown")
                func_desc = func.get("description", "")
                parts.append(f"  - {func_name}: {func_desc}")
                
                # Add parameter info
                input_schema = func.get("inputSchema", {})
                properties = input_schema.get("properties", {})
                if properties:
                    param_names = list(properties.keys())
                    parts.append(f"    Parameters: {', '.join(param_names)}")
        
        # Generate synthetic example questions
        examples = self._generate_example_questions(tool)
        if examples:
            parts.append("Example Use Cases:")
            for example in examples:
                parts.append(f"  - {example}")
        
        return "\n".join(parts)
    
    def _generate_example_questions(self, tool) -> List[str]:
        """Generate example questions that this tool could answer."""
        examples = []
        
        name_lower = tool.name.lower()
        desc = (tool.description or "").lower()
        
        # Basic template-based examples
        if "calculator" in name_lower or "calculate" in desc:
            examples.append("Calculate the sum of these numbers")
            examples.append("What is the result of this math operation?")
        
        if "email" in name_lower or "email" in desc:
            examples.append("Send an email notification")
            examples.append("Email this report to the team")
        
        if "api" in name_lower or "http" in desc or "rest" in desc:
            examples.append("Call an external API")
            examples.append("Fetch data from a web service")
        
        if "database" in name_lower or "db" in name_lower:
            examples.append("Query the database")
            examples.append("Store this information")
        
        if "search" in name_lower or "search" in desc:
            examples.append("Search for information")
            examples.append("Find relevant documents")
        
        # Generic fallback
        if not examples:
            examples.append(f"Use {tool.name} to process data")
        
        return examples
    
    async def ingest_tool(self, db, tool) -> bool:
        """
        Generate and store embeddings for a tool.
        
        Args:
            db: Database session
            tool: Tool model instance
            
        Returns:
            True if successful
        """
        try:
            enriched_text = self._build_enriched_text(tool)
            
            # Store in RAG service with tool metadata
            # Using tool ID as document identifier
            rag_service.add_text(
                text=enriched_text,
                conversation_id=self.collection_name,
                metadata={
                    "tool_id": tool.id,
                    "tool_name": tool.name,
                    "type": "tool"
                }
            )
            
            return True
        except Exception as e:
            print(f"Error ingesting tool {tool.id}: {e}")
            return False
    
    async def ingest_all_tools(self, db) -> int:
        """
        Ingest all tools from the database.
        
        Args:
            db: Database session
            
        Returns:
            Number of tools ingested
        """
        from app.models.tools import Tool
        
        tools = db.query(Tool).all()
        count = 0
        
        for tool in tools:
            if await self.ingest_tool(db, tool):
                count += 1
        
        return count
    
    def discover_tools(
        self, 
        query: str, 
        top_k: int = 10,
        db = None
    ) -> List[Dict[str, Any]]:
        """
        Find most relevant tools for a user query.
        
        Args:
            query: Natural language query
            top_k: Number of results to return
            db: Optional database session for fetching full tool data
            
        Returns:
            List of tool info dicts with relevance scores
        """
        try:
            # Search in RAG service
            results = rag_service.search(
                query=query,
                conversation_id=self.collection_name,
                k=top_k
            )
            
            discovered = []
            for result in results:
                metadata = result.get("metadata", {})
                discovered.append({
                    "tool_id": metadata.get("tool_id"),
                    "tool_name": metadata.get("tool_name"),
                    "relevance_score": result.get("score", 0),
                    "matched_text": result.get("text", "")[:200]
                })
            
            # If db provided, fetch full tool data
            if db and discovered:
                from app.models.tools import Tool
                
                tool_ids = [d["tool_id"] for d in discovered if d["tool_id"]]
                tools = db.query(Tool).filter(Tool.id.in_(tool_ids)).all()
                tool_map = {t.id: t for t in tools}
                
                for d in discovered:
                    tool = tool_map.get(d["tool_id"])
                    if tool:
                        d["tool"] = {
                            "id": tool.id,
                            "name": tool.name,
                            "description": tool.description,
                            "configuration": tool.configuration
                        }
            
            return discovered
            
        except Exception as e:
            print(f"Error discovering tools: {e}")
            return []
    
    def get_tools_context(
        self, 
        query: str, 
        db = None,
        top_k: int = 10
    ) -> str:
        """
        Get a formatted context string of relevant tools for LLM consumption.
        
        Args:
            query: Natural language query
            db: Database session
            top_k: Number of tools to include
            
        Returns:
            Formatted string describing available tools
        """
        discovered = self.discover_tools(query, top_k, db)
        
        if not discovered:
            return "No relevant tools found."
        
        lines = ["Available Tools:"]
        for d in discovered:
            tool = d.get("tool", {})
            lines.append(f"\n## {tool.get('name', d.get('tool_name', 'Unknown'))}")
            lines.append(f"ID: {d.get('tool_id')}")
            lines.append(f"Description: {tool.get('description', 'No description')}")
            
            config = tool.get("configuration", {})
            functions = config.get("selected_functions", [])
            if functions:
                lines.append("Functions:")
                for func in functions:
                    lines.append(f"  - {func.get('name')}: {func.get('description', '')}")
        
        return "\n".join(lines)


# Global instance
tool_discovery = AgentToolDiscovery()
