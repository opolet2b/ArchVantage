# Agent Builder Walkthrough

## Overview
I have implemented the "Agent Builder" feature, allowing you to create, configure, and preview AI agents.

## Features
### 1. Agent Management
- **List Agents**: View all created agents in the sidebar.
- **Create Agent**: Click the "+" button to start a new agent configuration.
- **Context Menu**: Rename or delete agents using the three-dots menu.

### 2. Configuration
- **Basic Info**: Set agent name, expectations, and constraints.
- **System Prompt**: Automatically generated from expectations/constraints. View/Edit via the popup.
- **Knowledge Base**: Drag & drop files to upload. They are automatically ingested (RAG).
- **Skills**: Select tools from the "Appstore" popup.

### 3. Live Preview
- **Interactive Chat**: Test your agent in real-time.
- **Visual Steps**: See the agent's thought process:
    - **Input**: User query.
    - **Thought**: Internal reasoning.
    - **Action**: Tool execution (mocked).
    - **Observation**: Tool result (mocked).
    - **Response**: Final answer.
- **Streaming**: Steps appear as they happen.

## Verification
1.  **Navigate**: Click "Agent Builder" in the sidebar.
2.  **Create**: Click "+" to create a new agent.
3.  **Configure**:
    - Enter Name: "Weather Bot".
    - Enter Expectations: "You are a helpful weather assistant."
    - Click "Save".
4.  **Upload**: Drag a file into the Knowledge Base area.
5.  **Preview**:
    - In the right panel, type "What is the weather?".
    - Watch the steps appear (Input -> Thought -> Action -> Observation -> Response).

## Technical Details
- **Backend**: New `/api/v1/agents` endpoints for CRUD and preview.
- **Storage**: Agents stored in `data/agents.json`.
- **Frontend**: New `/agents` page with 3-column layout using React/Next.js.
