# Agent Builder Implementation Plan

## Goal Description
Create a comprehensive "Agent Builder" interface allowing users to create, configure, and preview AI agents. This includes managing agent configurations, knowledge bases (RAG), and skills, as well as a live preview mode.

## User Review Required
> [!IMPORTANT]
> I will be using a simple JSON file storage for agents initially to keep it lightweight, similar to how conversations are likely stored or just for simplicity. If a database is preferred later, it can be migrated.

## Proposed Changes

### Backend
#### [NEW] [agent_model.py](file:///C:/Users/opole/Downloads/ChatBotn/backend/app/models/agent_model.py)
- Define `AgentConfig` Pydantic model:
    - `id`: str
    - `name`: str
    - `expectations`: str
    - `constraints`: str
    - `system_prompt`: str
    - `knowledge_base`: List[str] (filenames)
    - `skills`: List[str] (tool names)

#### [NEW] [agents.py](file:///C:/Users/opole/Downloads/ChatBotn/backend/app/routers/agents.py)
- `GET /agents`: List all agents.
- `POST /agents`: Create a new agent.
- `GET /agents/{agent_id}`: Get agent details.
- `PUT /agents/{agent_id}`: Update agent configuration.
- `DELETE /agents/{agent_id}`: Delete agent.
- `POST /agents/generate-prompt`: Generate system prompt from expectations/constraints.
- `POST /agents/{agent_id}/preview`: Run agent with current config (streaming response).
- `POST /agents/{agent_id}/upload`: Upload file to agent's knowledge base.
- `DELETE /agents/{agent_id}/files/{filename}`: Delete file from knowledge base.

#### [MODIFY] [main.py](file:///C:/Users/opole/Downloads/ChatBotn/backend/main.py)
- Include the new `agents` router.

### Frontend
#### [MODIFY] [app-sidebar.tsx](file:///C:/Users/opole/Downloads/ChatBotn/frontend/src/components/app-sidebar.tsx)
- Add "Agent Builder" icon/link to the navigation list.

#### [NEW] [page.tsx](file:///C:/Users/opole/Downloads/ChatBotn/frontend/src/app/agents/page.tsx)
- Main layout for the Agent Builder (3-column grid).

#### [NEW] [agent-list.tsx](file:///C:/Users/opole/Downloads/ChatBotn/frontend/src/components/agents/agent-list.tsx)
- Left column: List agents, add new, context menu (rename/delete).

#### [NEW] [agent-config.tsx](file:///C:/Users/opole/Downloads/ChatBotn/frontend/src/components/agents/agent-config.tsx)
- Center column: Configuration form.
- Inputs for Expectations, Constraints.
- Popup for System Prompt review.
- Knowledge Base section (Drag & Drop, List).
- Skills section (Selector).

#### [NEW] [agent-preview.tsx](file:///C:/Users/opole/Downloads/ChatBotn/frontend/src/components/agents/agent-preview.tsx)
- Right column: Chat interface for testing the agent.
- Visualizing steps (Input, Thought, Action, Observation, Response).

## Verification Plan
### Automated Tests
- Test backend CRUD endpoints using `pytest`.
- Test prompt generation endpoint.

### Manual Verification
- Create a new agent "Weather Bot".
- Configure expectations "You are a weather assistant".
- Generate system prompt.
- Upload a dummy PDF to knowledge base.
- Add a "Weather Tool" (mock).
- Save agent.
- In Preview, ask "What is the weather?".
- Verify the flow: Input -> Thought -> Action -> Response.
