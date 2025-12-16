"""
Agent Architect

LLM-powered service for generating Agent Blueprints from natural language.
Uses the selectable LLM and discovered tools to create valid JSON blueprints.
"""
from typing import Optional, List, Dict, Any
import json
import uuid

from app.services.llm_service import llm_service
from app.services.agent_tool_discovery import tool_discovery
from app.models.chat import Message


# System prompt for the Agent Architect
ARCHITECT_SYSTEM_PROMPT = """You are the Agent Architect, an expert at designing AI agent workflows.

Your task is to **wire together components on the canvas** into a coherent workflow based on the user's description.

## Canvas Components (What's already on the canvas)

{canvas_components}

## Available Tools (Can be referenced by CALL_TOOL nodes)

{discovered_tools}

## Primitive Types Reference

Each component on the canvas is one of these primitive types:

1. **START** - Entry point (every workflow begins here)
2. **END** - Exit point (params: output_template)
3. **HTTP_REQUEST** - REST API calls (params: method, url, headers, body)
4. **CALL_TOOL** - Invokes a tool (params: tool_id, arguments)
5. **CONDITION** - If/Else branching (params: expression, true_target, false_target)
6. **JSON_MAPPING** - Data extraction/transformation (params: source, template, output_variable)
7. **TEXT_TEMPLATE** - Jinja2 text formatting (params: template_string, variables, output_variable)
8. **FOREACH** - Loop over lists (params: items, iterator_var, subprocess_graph)
9. **LLM_DECISION** - LLM reasoning/routing (params: model, instruction, input_context, output_variable)

## Your Task

1. **Understand each canvas component** - identify what it does from its type and params
2. **Analyze the user's request** - understand the desired workflow logic
3. **Wire components together** - create edges connecting components in the right order
4. **Add START/END nodes** if not present on canvas
5. **Configure node parameters** including the START `inputs_schema` and END `output_template` to match user intentions
6. **Position nodes** with y increasing by ~100 for each step

## Input Schema Definition (IMPORTANT!)

The `inputs_schema` field defines what inputs the user must provide when running this agent.
It follows JSON Schema format. Any value referenced as `{{{{inputs.VARIABLE_NAME}}}}` in node params MUST be defined here.

Example for an agent that greets a user by name:
```json
"inputs_schema": {{
  "type": "object",
  "properties": {{
    "name": {{
      "type": "string",
      "description": "The user's name to greet"
    }}
  }},
  "required": ["name"]
}}
```

## Output Format

Output ONLY valid JSON - no markdown, no explanations, no thinking:

```json
{{
  "name": "Agent Name",
  "description": "What this agent does",
  "graph": {{
    "nodes": [
      {{"id": "start", "type": "START", "metadata": {{"label": "Start", "ui_position": {{"x": 250, "y": 0}}}}, "params": {{}}}},
      {{"id": "node_id", "type": "PRIMITIVE_TYPE", "metadata": {{"label": "Label", "ui_position": {{"x": 250, "y": 100}}}}, "params": {{}}}},
      {{"id": "end", "type": "END", "metadata": {{"label": "End", "ui_position": {{"x": 250, "y": 500}}}}, "params": {{"output_template": {{"final_output": "{{{{variable}}}}"}}}}}}
    ],
    "edges": [
      {{"id": "edge_1", "source": "start", "target": "next_node"}},
      {{"id": "edge_2", "source": "last_node", "target": "end"}}
    ]
  }},
  "inputs_schema": {{
    "type": "object",
    "properties": {{
      "example_input": {{"type": "string", "description": "Description of this input"}}
    }},
    "required": ["example_input"]
  }},
  "secrets_requirements": []
}}
```

CRITICAL: 
- Output PURE JSON only. No <think> tags, no markdown code fences, no explanations.
- ALWAYS define inputs_schema with any variables the workflow needs from the user.

Generate the blueprint now:"""


class AgentArchitect:
    """
    Generates Agent Blueprints from natural language descriptions.
    
    Uses RAG to discover relevant tools and an LLM to create the blueprint.
    """
    
    def __init__(self):
        self.system_prompt_template = ARCHITECT_SYSTEM_PROMPT
    
    async def generate_blueprint(
        self, 
        prompt: str, 
        model: str = "default",
        selected_tool_ids: list = None,
        selected_apis: list = None,
        canvas_context: dict = None,
        db = None
    ) -> Dict[str, Any]:
        """
        Generate a blueprint from a natural language description.
        
        Args:
            prompt: User's description of the desired agent
            model: LLM model to use
            selected_tool_ids: List of tool IDs explicitly selected by user
            selected_apis: List of HTTP API configs selected by user
            canvas_context: Current canvas nodes and edges to wire together
            db: Database session
            
        Returns:
            Generated blueprint dict
        """
        # ==== DEBUG: Log received canvas context ====
        print("\n" + "=" * 60)
        print("[ARCHITECT DEBUG] Canvas Context Received:")
        if canvas_context:
            nodes = canvas_context.get("nodes", [])
            edges = canvas_context.get("edges", [])
            print(f"  Nodes count: {len(nodes)}")
            for node in nodes:
                print(f"    - ID: {node.get('id')}, Type: {node.get('type')}, "
                      f"Label: {node.get('label')}")
            print(f"  Edges count: {len(edges)}")
            for edge in edges:
                print(f"    - {edge.get('source')} → {edge.get('target')}")
        else:
            print("  No canvas context provided")
        print("=" * 60 + "\n")
        
        # Format canvas context for the prompt
        canvas_components = self._format_canvas_context(canvas_context)
        
        # ==== DEBUG: Log formatted canvas components ====
        print("[ARCHITECT DEBUG] Formatted Canvas Components for LLM:")
        print("-" * 40)
        print(canvas_components[:500] if len(canvas_components) > 500 
              else canvas_components)
        if len(canvas_components) > 500:
            print(f"  ... (truncated, total {len(canvas_components)} chars)")
        print("-" * 40 + "\n")
        
        # Build tools context from selected tools or auto-discover
        if selected_tool_ids and db:
            tools_context = self._get_selected_tools_context(selected_tool_ids, db)
        else:
            # Try to auto-discover tools, but don't fail if it errors
            try:
                tools_context = tool_discovery.get_tools_context(prompt, db)
            except Exception as e:
                print(f"Tool discovery failed (non-fatal): {e}")
                tools_context = "No tools available. You can use HTTP_REQUEST primitive for API calls."
        
        # Add selected APIs context if provided
        if selected_apis:
            apis_context = self._format_selected_apis(selected_apis)
            tools_context = f"{tools_context}\n\n{apis_context}"
        
        # Build the system prompt with canvas context
        system_prompt = self.system_prompt_template.format(
            canvas_components=canvas_components,
            discovered_tools=tools_context
        )
        
        # ==== DEBUG: Log user prompt ====
        print(f"[ARCHITECT DEBUG] User Prompt: {prompt}")
        
        # Call LLM
        messages = [
            Message(role="system", content=system_prompt),
            Message(role="user", content=prompt)
        ]
        
        response = await llm_service.chat(messages, model_name=model)
        
        # ==== DEBUG: Log raw LLM response ====
        print("\n[ARCHITECT DEBUG] LLM Raw Response:")
        print("-" * 40)
        print(response[:800] if len(response) > 800 else response)
        if len(response) > 800:
            print(f"  ... (truncated, total {len(response)} chars)")
        print("-" * 40 + "\n")
        
        # Parse the response as JSON
        blueprint = self._parse_blueprint(response)
        
        # ==== DEBUG: Log parsed nodes and edges ====
        print("[ARCHITECT DEBUG] Parsed Blueprint:")
        nodes = blueprint.get('graph', {}).get('nodes', [])
        edges = blueprint.get('graph', {}).get('edges', [])
        print(f"  Nodes ({len(nodes)}):")
        for node in nodes:
            print(f"    - ID: {node.get('id')}, Type: {node.get('type')}")
        print(f"  Edges ({len(edges)}):")
        for edge in edges:
            print(f"    - {edge.get('source')} → {edge.get('target')}")
        
        # Normalize the blueprint to handle LLM variations
        blueprint = self._normalize_blueprint(blueprint)
        
        # ==== DEBUG: Log normalized edges ====
        print("[ARCHITECT DEBUG] After Normalization:")
        normalized_edges = blueprint.get('graph', {}).get('edges', [])
        print(f"  Edges ({len(normalized_edges)}):")
        for edge in normalized_edges:
            print(f"    - {edge.get('source')} → {edge.get('target')}")
        print("=" * 60 + "\n")
        
        # Add generated ID if not present
        if "id" not in blueprint:
            blueprint["id"] = str(uuid.uuid4())
        
        # Infer inputs_schema if not properly defined
        blueprint = self._infer_inputs_schema(blueprint)
        
        return blueprint
    
    def _get_selected_tools_context(
        self,
        tool_ids: list,
        db
    ) -> str:
        """
        Build context string from explicitly selected tools.
        
        Args:
            tool_ids: List of tool IDs selected by user
            db: Database session
            
        Returns:
            Formatted context string for LLM
        """
        from app.models.tools import Tool
        
        if not tool_ids:
            return "No tools selected."
        
        tools = db.query(Tool).filter(Tool.id.in_(tool_ids)).all()
        
        if not tools:
            return "No tools found for the given IDs."
        
        lines = ["Selected Tools to use in the agent:"]
        for tool in tools:
            lines.append(f"\n## {tool.name}")
            lines.append(f"Tool ID: {tool.id}")
            lines.append(f"Description: {tool.description or 'No description'}")
            
            config = tool.configuration or {}
            
            # Add input schema if available
            input_schema = config.get("input_schema", {})
            if input_schema:
                lines.append("Input Schema:")
                properties = input_schema.get("properties", {})
                required = input_schema.get("required", [])
                for prop_name, prop_schema in properties.items():
                    req_marker = " (required)" if prop_name in required else ""
                    lines.append(
                        f"  - {prop_name}: {prop_schema.get('type', 'any')}"
                        f"{req_marker} - {prop_schema.get('description', '')}"
                    )
            
            # Add functions if available
            functions = config.get("selected_functions", [])
            if functions:
                lines.append("Available Functions:")
                for func in functions:
                    lines.append(
                        f"  - {func.get('name')}: {func.get('description', '')}"
                    )
        
        return "\n".join(lines)
    
    def _format_selected_apis(self, apis: list) -> str:
        """
        Format selected HTTP APIs for the context.
        
        Args:
            apis: List of API configurations
            
        Returns:
            Formatted context string
        """
        if not apis:
            return ""
        
        lines = ["Selected HTTP APIs to use in the agent:"]
        for i, api in enumerate(apis, 1):
            lines.append(f"\n## API {i}")
            lines.append(f"Method: {api.get('method', 'GET')}")
            lines.append(f"URL: {api.get('url', 'Not specified')}")
            if api.get('description'):
                lines.append(f"Description: {api.get('description')}")
        
        return "\n".join(lines)
    
    def _infer_inputs_schema(self, blueprint: Dict[str, Any]) -> Dict[str, Any]:
        """
        Infer inputs_schema from the blueprint if not properly defined.
        
        Scans all node parameters for variable references like {{inputs.xxx}}
        or {{variables.xxx}} and builds an inputs_schema from them.
        
        Args:
            blueprint: The generated blueprint dict
            
        Returns:
            Blueprint with inferred inputs_schema if needed
        """
        import re
        
        existing_schema = blueprint.get("inputs_schema", {})
        existing_properties = existing_schema.get("properties", {})
        
        # If already has properties defined, trust the LLM output
        if existing_properties:
            return blueprint
        
        # Scan for variable references in node params
        discovered_inputs = set()
        
        # Pattern to match {{inputs.VAR}} or {{variables.VAR}}
        pattern = re.compile(r'\{\{(?:inputs|variables)\.(\w+)\}\}')
        
        graph = blueprint.get("graph", {})
        nodes = graph.get("nodes", [])
        
        for node in nodes:
            params = node.get("params", {})
            
            # Recursively find all string values in params
            def scan_value(value):
                if isinstance(value, str):
                    matches = pattern.findall(value)
                    discovered_inputs.update(matches)
                elif isinstance(value, dict):
                    for v in value.values():
                        scan_value(v)
                elif isinstance(value, list):
                    for item in value:
                        scan_value(item)
            
            scan_value(params)
        
        # Build inputs_schema from discovered inputs
        if discovered_inputs:
            inferred_schema = {
                "type": "object",
                "properties": {},
                "required": []
            }
            
            for input_name in sorted(discovered_inputs):
                # Skip internal variables (start with _)
                if input_name.startswith("_"):
                    continue
                    
                inferred_schema["properties"][input_name] = {
                    "type": "string",
                    "description": f"Input value for {input_name}"
                }
                inferred_schema["required"].append(input_name)
            
            if inferred_schema["properties"]:
                blueprint["inputs_schema"] = inferred_schema
                print(f"[ARCHITECT] Inferred inputs_schema: {inferred_schema}")
        
        return blueprint
    
    def _format_canvas_context(self, canvas_context: dict) -> str:
        """
        Format canvas components for LLM understanding.
        
        Describes each component on the canvas so the LLM knows what
        it needs to wire together.
        
        Args:
            canvas_context: Dict with 'nodes' and 'edges' lists
            
        Returns:
            Formatted context string
        """
        if not canvas_context or not canvas_context.get("nodes"):
            return "No components on canvas. Create a complete workflow from scratch."
        
        nodes = canvas_context.get("nodes", [])
        edges = canvas_context.get("edges", [])
        
        lines = [f"Found {len(nodes)} component(s) on the canvas:"]
        
        for i, node in enumerate(nodes, 1):
            node_type = node.get("type", "UNKNOWN")
            node_id = node.get("id", f"node_{i}")
            label = node.get("label", node_type)
            params = node.get("params", {})
            
            lines.append(f"\n### Component {i}: {label}")
            lines.append(f"- Type: {node_type}")
            lines.append(f"- ID: {node_id}")
            
            # Describe what this component does based on type
            if node_type == "CALL_TOOL":
                tool_id = params.get("tool_id")
                tool_name = params.get("tool_name")
                tool_description = params.get("tool_description")
                
                if tool_name:
                    lines.append(f"- Tool Name: {tool_name}")
                if tool_id:
                    lines.append(f"- Tool ID: {tool_id}")
                if tool_description:
                    # User-provided description for context
                    lines.append(f"- Purpose: {tool_description}")
                else:
                    lines.append("- Purpose: Invokes an external tool")
            elif node_type == "LLM_DECISION":
                lines.append("- Purpose: Uses LLM for reasoning or routing decisions")
                if params.get("instruction"):
                    lines.append(f"- Instruction: {params.get('instruction')}")
            elif node_type == "HTTP_REQUEST":
                lines.append("- Purpose: Makes HTTP API calls")
                if params.get("url"):
                    lines.append(f"- URL: {params.get('url')}")
            elif node_type == "CONDITION":
                lines.append("- Purpose: Branches workflow based on condition")
            elif node_type == "FOREACH":
                lines.append("- Purpose: Iterates over a list of items")
            elif node_type == "JSON_MAPPING":
                lines.append("- Purpose: Extracts/transforms data")
            elif node_type == "TEXT_TEMPLATE":
                lines.append("- Purpose: Formats text output")
            
            # Show any configured params
            if params:
                lines.append(f"- Params: {json.dumps(params)}")
        
        if edges:
            lines.append("\n### Existing Connections:")
            for edge in edges:
                lines.append(f"- {edge.get('source')} → {edge.get('target')}")
        else:
            lines.append("\n### No connections yet - you need to wire these together!")
        
        lines.append("\nYour job: Connect these components logically based on the user's request.")
        
        return "\n".join(lines)
    
    def _normalize_blueprint(self, blueprint: Dict[str, Any]) -> Dict[str, Any]:
        """
        Normalize a blueprint to handle LLM variations.
        
        Handles different field names used by various LLMs:
        - Edges: from/to -> source/target, sourceId/targetId -> source/target
        - Nodes: ensure required fields exist
        """
        if "graph" not in blueprint:
            return blueprint
        
        graph = blueprint["graph"]
        
        # Normalize edges
        if "edges" in graph:
            normalized_edges = []
            for edge in graph["edges"]:
                normalized_edge = {}
                
                # Handle source variations
                source = (
                    edge.get("source") or
                    edge.get("from") or
                    edge.get("sourceId") or
                    edge.get("from_node") or
                    edge.get("src")
                )
                
                # Handle target variations
                target = (
                    edge.get("target") or
                    edge.get("to") or
                    edge.get("targetId") or
                    edge.get("to_node") or
                    edge.get("dst")
                )
                
                if source:
                    normalized_edge["source"] = source
                if target:
                    normalized_edge["target"] = target
                
                # Copy edge ID if present
                if "id" in edge:
                    normalized_edge["id"] = edge["id"]
                else:
                    # Generate an ID
                    normalized_edge["id"] = f"edge_{source}_{target}"
                
                # Copy optional fields
                if "condition" in edge:
                    normalized_edge["condition"] = edge["condition"]
                
                normalized_edges.append(normalized_edge)
            
            graph["edges"] = normalized_edges
        
        # Normalize nodes
        if "nodes" in graph:
            for node in graph["nodes"]:
                # Ensure metadata exists
                if "metadata" not in node:
                    node["metadata"] = {}
                
                # Handle label variations
                if "label" not in node["metadata"]:
                    node["metadata"]["label"] = node.get("label", node.get("type", "Node"))
                
                # Handle position variations
                if "ui_position" not in node["metadata"]:
                    pos = node.get("position", node.get("pos", {}))
                    if pos:
                        node["metadata"]["ui_position"] = {"x": pos.get("x", 0), "y": pos.get("y", 0)}
                    else:
                        node["metadata"]["ui_position"] = {"x": 0, "y": 0}
                
                # Ensure params exists
                if "params" not in node:
                    node["params"] = {}
        
        blueprint["graph"] = graph
        return blueprint
    
    def _parse_blueprint(self, response: str) -> Dict[str, Any]:
        """
        Parse LLM response into a valid blueprint.
        
        Handles common issues like markdown code blocks and reasoning tags.
        """
        import re
        
        text = response.strip()
        
        # Remove <think>...</think> tags from reasoning models (e.g., DeepSeek-R1)
        text = re.sub(r'<think>[\s\S]*?</think>', '', text, flags=re.IGNORECASE)
        text = text.strip()
        
        # Remove markdown code blocks if present
        if text.startswith("```"):
            # Remove first line with ```json or ```
            lines = text.split("\n")
            text = "\n".join(lines[1:])
        if text.endswith("```"):
            text = text[:-3]
        
        text = text.strip()
        
        try:
            return json.loads(text)
        except json.JSONDecodeError as e:
            # Try to extract JSON from the response
            import re
            json_match = re.search(r'\{[\s\S]*\}', text)
            if json_match:
                try:
                    return json.loads(json_match.group())
                except json.JSONDecodeError:
                    pass
            
            # Return a minimal valid blueprint with error info
            return {
                "id": str(uuid.uuid4()),
                "name": "Generated Agent",
                "description": "Blueprint generation failed - please try again",
                "graph": {"nodes": [], "edges": []},
                "inputs_schema": {},
                "secrets_requirements": [],
                "_error": f"Failed to parse LLM response: {str(e)}"
            }
    
    def validate_blueprint(self, blueprint: Dict[str, Any]) -> Dict[str, Any]:
        """
        Validate a blueprint structure.
        
        Args:
            blueprint: Blueprint dict to validate
            
        Returns:
            Validation result with is_valid and errors
        """
        errors = []
        
        # Check required fields
        if "graph" not in blueprint:
            errors.append("Missing 'graph' field")
        else:
            graph = blueprint["graph"]
            if "nodes" not in graph:
                errors.append("Missing 'graph.nodes' field")
            if "edges" not in graph:
                errors.append("Missing 'graph.edges' field")
        
        # Validate nodes
        if "graph" in blueprint and "nodes" in blueprint["graph"]:
            node_ids = set()
            valid_types = {
                "START", "END", "HTTP_REQUEST", "CALL_TOOL", "CONDITION", 
                "JSON_MAPPING", "TEXT_TEMPLATE", "FOREACH", "LLM_DECISION"
            }
            
            for i, node in enumerate(blueprint["graph"]["nodes"]):
                if "id" not in node:
                    errors.append(f"Node {i} missing 'id'")
                else:
                    if node["id"] in node_ids:
                        errors.append(f"Duplicate node ID: {node['id']}")
                    node_ids.add(node["id"])
                
                if "type" not in node:
                    errors.append(f"Node {i} missing 'type'")
                elif node["type"] not in valid_types:
                    errors.append(f"Invalid node type: {node['type']}")
        
        # Validate edges
        if "graph" in blueprint and "edges" in blueprint["graph"]:
            for i, edge in enumerate(blueprint["graph"]["edges"]):
                if "source" not in edge:
                    errors.append(f"Edge {i} missing 'source'")
                if "target" not in edge:
                    errors.append(f"Edge {i} missing 'target'")
        
        return {
            "is_valid": len(errors) == 0,
            "errors": errors
        }


# Global instance
agent_architect = AgentArchitect()
