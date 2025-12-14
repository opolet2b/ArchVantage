# ChatBot Agent Orchestrator - Walkthrough

## Overview
This application is a comprehensive ChatBot with advanced capabilities including RAG (Retrieval-Augmented Generation), Agent Orchestration (Visual Workflow), and Deep Research.

## Features Implemented

### 1. Core Chat Interface
- **Chat UI**: A modern, responsive chat interface built with Next.js and Tailwind CSS.
- **LLM Support**: Integrated with OpenAI, Anthropic, and OpenRouter.
- **Streaming**: Real-time response streaming.

### 2. Agent Orchestration
- **Visual Editor**: A drag-and-drop editor using React Flow to design agent workflows.
- **Backend Engine**: A LangGraph-based engine that executes the designed workflows.
- **Custom Agents**: Create agents with specific models and prompts.

### 3. RAG System
- **Document Ingestion**: Supports PDF, DOCX, TXT, MD files.
- **Folder Monitoring**: Automatically ingests files added to the `backend/data` folder using `watchdog`.
- **Vector Database**: Uses ChromaDB for efficient similarity search.

### 4. Web Search & Deep Research
- **Web Search**: Integrated DuckDuckGo for web search capabilities.
- **Deep Research**: A specialized loop that searches the web and synthesizes answers using an LLM.

## How to Run

### Backend
1. Navigate to `backend` directory.
2. Activate virtual environment: `.\venv\Scripts\activate`
3. Run server: `uvicorn main:app --reload --port 8000`

### Frontend
1. Navigate to `frontend` directory.
2. Run development server: `npm run dev`
3. Open `http://localhost:3000`

## Verification

### RAG Verification
- Place a file in `backend/data`.
- Run `python backend/test_rag.py` to verify ingestion and query.

### Workflow Verification
- Run `python backend/test_workflow.py` to verify agent orchestration.

### Research Verification
- Run `python backend/test_research.py` to verify web search and reasoning.

## Next Steps
- **UI Integration**: Connect the RAG and Research features more deeply into the frontend UI (e.g., file upload button, research mode toggle).
- **Authentication**: Add user authentication.
- **Deployment**: Dockerize the application for deployment.
