from typing import Dict, Any, List, TypedDict, Annotated
from langgraph.graph import StateGraph, END
from langchain_core.messages import BaseMessage, HumanMessage, AIMessage
from app.services.llm_service import llm_service
from app.models.chat import Message
import operator

class AgentState(TypedDict):
    messages: Annotated[List[BaseMessage], operator.add]
    current_node: str

class WorkflowService:
    def __init__(self):
        self.workflows = {} 

    def _create_agent_node(self, node_data: Dict[str, Any]):
        async def agent_node(state: AgentState):
            messages = state["messages"]
            model_name = node_data.get("model", "gpt-3.5-turbo")
            
            # Convert LangChain messages to Pydantic Message objects
            chat_messages = []
            for msg in messages:
                role = "user" if isinstance(msg, HumanMessage) else "assistant"
                chat_messages.append(Message(role=role, content=msg.content))
            
            # Call LLM
            response = await llm_service.chat(chat_messages, model_name)
            return {"messages": [AIMessage(content=response)], "current_node": node_data.get("label")}
        return agent_node

    async def execute_workflow(self, workflow_def: Dict[str, Any], input_message: str) -> Dict[str, Any]:
        nodes = workflow_def.get("nodes", [])
        edges = workflow_def.get("edges", [])
        
        if not nodes:
            return {"status": "error", "message": "No nodes in workflow"}

        workflow = StateGraph(AgentState)
        
        # Add nodes
        node_map = {}
        start_node_id = None
        
        # Find start node (assuming the first one or one labeled 'Start')
        # For simplicity, we'll assume the first node is start if not specified
        
        for node in nodes:
            node_id = node["id"]
            node_data = node.get("data", {})
            node_label = node_data.get("label", f"Node {node_id}")
            
            # Create a runnable node function
            workflow.add_node(node_id, self._create_agent_node(node_data))
            node_map[node_id] = node_data
            
            if not start_node_id:
                start_node_id = node_id

        # Add edges
        for edge in edges:
            source = edge["source"]
            target = edge["target"]
            workflow.add_edge(source, target)

        # Set entry point
        if start_node_id:
            workflow.set_entry_point(start_node_id)
        
        # Compile
        app = workflow.compile()
        
        # Execute
        inputs = {"messages": [HumanMessage(content=input_message)], "current_node": "Start"}
        final_state = await app.ainvoke(inputs)
        
        return {
            "status": "success", 
            "result": final_state["messages"][-1].content,
            "history": [m.content for m in final_state["messages"]]
        }

    def save_workflow(self, workflow_id: str, workflow_def: Dict[str, Any]):
        self.workflows[workflow_id] = workflow_def
        return {"status": "saved", "id": workflow_id}

    def get_workflow(self, workflow_id: str):
        return self.workflows.get(workflow_id)

workflow_service = WorkflowService()
