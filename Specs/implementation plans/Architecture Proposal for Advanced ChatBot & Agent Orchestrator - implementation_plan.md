# Architecture Proposal for Advanced ChatBot & Agent Orchestrator

## Goal Description
Develop a comprehensive ChatBot application featuring local/cloud LLM support, a visual agent orchestration interface, advanced RAG capabilities with file monitoring, web search, and deep research functionalities.

## User Review Required
> [!IMPORTANT]
> Please review the technology stack and component choices below. Specifically, confirm if **Python (FastAPI)** is acceptable for the backend (standard for AI apps) and **Next.js** for the frontend.

## Proposed Architecture

### 1. Tech Stack

*   **Frontend**: 
    *   **Framework**: Next.js (React) - for a responsive, modern web app.
    *   **UI Library**: Tailwind CSS + Shadcn/UI - for premium aesthetics.
    *   **Visual Editor**: React Flow - for the drag-and-drop agent workflow designer.
    *   **State Management**: Zustand or React Context.
*   **Backend**:
    *   **Framework**: FastAPI (Python) - High performance, native async support, excellent ecosystem for AI (LangChain, LlamaIndex).
    *   **Task Queue**: Celery + Redis (optional, for long-running deep research tasks).
*   **AI / LLM Layer**:
    *   **Orchestration**: LangChain / LangGraph - for building stateful agents and workflows.
    *   **Local LLMs**: Ollama or Llama.cpp integration.
    *   **Cloud LLMs**: OpenAI / Anthropic API integration.
    *   **API Gateway**: OpenRouter integration (or similar) to flexibly select and switch between various cloud models.
    *   **Tools Interface**: Model Context Protocol (MCP) support to standardize tool usage and connectivity across agents.
*   **Data & RAG**:
    *   **Vector Database**: ChromaDB (Local/Server) or Qdrant - for storing embeddings.
    *   **Embeddings**: HuggingFace (Local) or OpenAI (Cloud).
    *   **File Monitoring**: Watchdog (Python library) - to detect file changes in monitored folders.
*   **Search**:
    *   **Provider**: Tavily API or Serper (Google Search wrapper) - for web search capabilities.

### 2. System Components

#### A. Frontend Application
*   **Chat Interface**: Standard chat UI with streaming responses, markdown support, and mode selection (RAG, Web, LLM, Deep Research).
*   **Workflow Builder**: A canvas to drag nodes (Agents, Tools, Prompts) and connect them to define execution flows.
*   **Simple Agent Builder**: A simplified UI mode to create single-purpose agents by selecting a model and assigning pre-defined tools (e.g., Calculator, Web Search, Weather) without full graph complexity.
*   **Settings/Configuration**: Manage API keys, select models, configure RAG folders.

#### B. Backend API Service
*   **API Endpoints**: REST/WebSockets for chat, workflow execution, and management.
*   **Agent Engine**: Executes the graphs defined in the frontend. Handles routing between agents.
*   **RAG Manager**: 
    *   *Ingestion Service*: Uses `unstructured` or similar robust loaders to parse PDF, DOC, DOCX, PPTX, TXT, MD, and other common office formats.
    *   *Watcher Service*: Runs in the background to sync folder contents with the vector DB.
*   **Research Engine**: A specialized agent loop that breaks down questions, searches the web, reads content, and synthesizes answers.

### 3. Data Flow

1.  **Chat**: User -> Frontend -> Backend -> LLM -> Frontend (Stream).
2.  **RAG**: 
    *   *Ingest*: User selects folder -> Backend Watcher starts -> Files parsed -> Embeddings created -> Stored in Vector DB.
    *   *Query*: User Query -> Embedding -> Vector DB Search -> Context + Query -> LLM -> Answer.
3.  **Agent Workflow**: 
    *   User designs graph -> JSON definition sent to Backend -> LangGraph constructs runtime graph -> Execution -> Results sent back.

## Implementation Phases

1.  **Setup**: Initialize Next.js and FastAPI projects.
2.  **Core Chat**: Basic LLM connectivity (Local/Cloud).
3.  **RAG System**: File ingestion and vector search.
4.  **Agent Builder**: React Flow integration and backend graph execution.
5.  **Advanced Features**: Web Search and Deep Research agents.
