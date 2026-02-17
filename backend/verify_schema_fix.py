from app.schemas.agent_schemas import AgentGraph, GraphEdge

test_data = {
    "nodes": [],
    "edges": [
        {
            "id": "e1",
            "source": "n1",
            "target": "n2",
            "sourceHandle": "body",
            "targetHandle": "input"
        }
    ]
}

try:
    graph = AgentGraph(**test_data)
    edge = graph.edges[0]
    print(f"Edge Source Handle: {edge.sourceHandle}")
    print(f"Edge Target Handle: {edge.targetHandle}")
    
    if edge.sourceHandle == "body":
        print("SUCCESS: sourceHandle preserved.")
    else:
        print("FAILURE: sourceHandle lost.")
except Exception as e:
    print(f"ERROR: {e}")
