# Technical Architecture Overview

**Status**: Draft
**Last Updated**: 2025-12-14

## 1. High-Level Architecture

The ChatBotn project follows a modern web application architecture, separated into a React-based frontend and a Python FastAPI backend.

### 1.1 Diagram
```mermaid
graph TD
    User[User] -->|HTTPS| FE[Frontend (Next.js)]
    FE -->|REST API| BE[Backend (FastAPI)]
    BE -->|SQL| DB[(SQLite)]
    BE -->|Embeddings| VDB[(ChromaDB)]
    BE -->|MCP Protocol| MCP[MCP Servers]
```

## 2. Technology Stack

### 2.1 Frontend
- **Framework**: Next.js 16 (App Router)
- **Library**: React 19
- **Styling**: Tailwind CSS + Shadcn UI (@radix-ui primitives)
- **Use State Management**: Zustand
- **Visualization**: React Flow (@xyflow/react)
- **Icons**: Lucide React
- **Language**: TypeScript

### 2.2 Backend
- **Framework**: FastAPI
- **Language**: Python 3.x
- **Orchestration**: LangChain, LangGraph
- **RAG/Data Ingestion**: LlamaIndex, Unstructured, python-docx, pypdf
- **Tooling**: MCP (Model Context Protocol) SDK
- **ORM**: SQLAlchemy
- **Vector Store**: ChromaDB (for RAG/Embeddings)
- **Task Scheduling**: Standard AsyncIO

## 3. Directory Structure

### 3.1 Backend (`/backend`)
- **`app/routers/`**: API Route definitions (`auth`, `users`, `chat`, `agents`, `tools`).
- **`app/services/`**: Business logic.
- **`app/core/`**: Configuration and database setup.
- **`chroma_db/`**: Persisted vector store data.
- **`data/`**: Application data storage.

### 3.2 Frontend (`/frontend`)
- **`src/app/`**: Next.js App Router pages and layouts.
- **`src/components/`**: Reusable UI components.
    - **`components/ui/`**: Shadcn UI components.
    - **`components/tools/`**: Tool Builder specific components.
    - **`components/agents/`**: Agent Builder specific components.
- **`src/lib/`**: Utility functions.

## 4. Data Layer

### 4.1 Relationship Database
- **Technology**: SQLite
- **Files**: `backend/chatbot.db` (Primary), `backend/test.db` (Testing).
- **Key Entities**: Users, Roles, Agents, Tools, Chat History.

### 4.2 Vector Database
- **Technology**: ChromaDB
- **Purpose**: Storing document embeddings for RAG (Retrieval-Augmented Generation).
- **Location**: `backend/chroma_db/`

## 5. Security Architecture
- **Authentication**: JWT (JSON Web Tokens) handling in `auth` router.
- **Authorization**: RBAC (Role-Based Access Control) via `roles` router and middleware.
- **CORS**: Configured in `main.py` referencing `BACKEND_CORS_ORIGINS`.

## 6. Deployment
- **Configuration**:
    - Frontend: `package.json`, `.env.local`
    - Backend: `.env`, `requirements.txt`
