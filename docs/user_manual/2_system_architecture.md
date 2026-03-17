# Volume 2: System Architecture

## 1. Architectural Overview
SemanticCanvas is built on a distributed, cloud-native architecture that ensures high performance even with massive spatial datasets.

## 2. Frontend (The Interface)
- **Framework**: Next.js 14 (App Router).
- **Visualization engine**: React Flow handles the rendering of nodes and edges with optimized viewport management.
- **State Management**: Zustand for global UI state and canvas-specific stores.
- **Styling**: Tailwind CSS and Vanilla CSS for a premium, custom aesthetic.

## 3. Backend (The Intelligence Engine)
- **API Framework**: FastAPI (Python 3.10+).
- **Orchestration**: LangGraph manages complex, multi-step agentic workflows.
- **Data Ingestion**: LlamaIndex provides the abstraction for RAG (Retrieval-Augmented Generation).

## 4. Storage Layer
- **Relational (SQLite)**: Core application state, user accounts, and metadata.
- **Vector (ChromaDB)**: High-dimensional embeddings for semantic search and RAG.
- **Graph (ArcadeDB)**: Storage of the semantic ontology and derived relationships.

## 5. Data Flow
1.  **Ingestion**: A PDF is uploaded -> Backend extracts text and visual elements -> Embeddings are created in ChromaDB.
2.  **Execution**: User triggers an agent -> LangGraph initializes the blueprint -> Agent queries ChromaDB and ArcadeDB for context -> LLM generates output.
3.  **Interaction**: User moves a node -> Frontend sends delta to FastAPI -> SQLite is updated in real-time.
