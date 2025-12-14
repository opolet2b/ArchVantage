# Agent Builder - Technical Specification

**Related Functional Spec**: [Overview.md](./Overview.md)
**Status**: Draft

## 1. Architecture Overview
The Agent Builder consists of a React Flow frontend for graph composition and a custom Python runtime (`AgentRuntime`) for execution.

### 1.1 Data Model
Agents are stored as JSON Blueprints in the database.

```python
class AgentBlueprint(BaseModel):
    id: str
    name: str
    graph: {
        "nodes": [
            {"id": "node_1", "type": "LLM", "params": {...}}
        ],
        "edges": [
            {"source": "node_1", "target": "node_2"}
        ]
    }
```

## 2. Execution Engine (`AgentRuntime`)
Located in `app/services/agent_runtime.py`.

- **Graph Traversal**: The runtime uses an adjacency list (`self.edges`) to traverse the graph.
- **State Management**: Uses `AgentState` TypedDict to track `inputs`, `variables`, and `history`.
- **Primitives**: Each node type corresponds to a "Primitive" class (e.g., `LLMPrimitive`) that executes the specific logic.
- **LangGraph Interop**: The system is designed to optionally offload execution to LangGraph if available.

## 3. Frontend Components
- **`GraphCanvas`**: Wrapper around `ReactFlow`.
- **`Node Types`**: Custom React components for each node type (visual styling).

## 4. Persistence
- **Blueprints**: Stored in `agent_blueprints` table (SQL).
- **Executions**: History stored in `agent_executions` table for debugging.
