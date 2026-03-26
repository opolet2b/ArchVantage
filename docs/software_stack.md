# Software Stack

This document describes the software stack used in the ChatBotn application, covering both the frontend and backend components.

## Backend Stack

The backend is built with **Python** using the **FastAPI** framework for a high-performance, asynchronous API.

### Core Frameworks
- **FastAPI**: Modern, fast (high-performance) web framework for building APIs with Python.
- **Uvicorn**: Lightning-fast ASGI server implementation.
- **SQLAlchemy**: SQL toolkit and Object-Relational Mapper (ORM) for Python.

### AI & LLM Orchestration
- **LlamaIndex**: Data framework for LLM applications, used for data ingestion, indexing, and retrieval (RAG).
- **LangChain**: Framework for developing applications powered by large language models.
- **Ollama**: Integration for local LLM and embedding models.
- **OpenAI / Anthropic**: Integrations for remote LLM providers.

### Databases & Storage
- **Relational Database**: SQLite (stored in `backend/db/sql_app.db`) managed via SQLAlchemy.
- **Vector Store**: **ChromaDB** for efficient semantic search and retrieval (located in `backend/chroma_db`).
- **Knowledge Graph**: **ArcadeDB** for structured relationship mapping (Knowledge Graph).
- **File Storage**: Local `data/` directory for uploaded assets and processed RAG files.

### Security & Authentication
- **JWT (JSON Web Tokens)**: Used for stateless authentication.
- **Passlib (bcrypt)**: For secure password hashing.
- **Python-jose**: For JWT signing and verification.

---

## Frontend Stack

The frontend is a modern web application built with **Next.js** and **React**.

### Core Frameworks
- **Next.js 16**: React framework with App Router, server-side rendering, and optimized performance.
- **React 19**: The latest version of the core UI library.
- **TypeScript**: Ensuring type safety across the frontend codebase.

### State Management & Styling
- **Zustand**: A small, fast, and scalable bearbones state-management solution.
- **Tailwind CSS 4**: Utility-first CSS framework for rapid UI development.
- **Radix UI**: Primitives for building high-quality, accessible UI components (Headless UI).
- **Lucide React**: Comprehensive icon library.

### Visualizations & Interactive Components
- **Cytoscape.js**: Graph theory library for visualizing complex relationships and knowledge graphs.
- **React Flow (@xyflow/react)**: Library for building node-based editors and diagrams.
- **Deck.gl / Luma.gl**: High-performance WebGL2-powered data visualization (Maps/3D).
- **Recharts**: Composible charting library built on React components.
- **Tiptap**: Headless rich-text editor based on ProseMirror.

### Document & Media Handling
- **react-pdf / pdfjs-dist**: For PDF rendering and indexing.
- **xlsx**: Spreadsheet parsing (Excel).
- **jspdf / html-to-image**: For workspace and document exportation.

---

## Infrastructure

- **Docker & Docker Compose**: For containerized deployment and environment consistency.
- **Virtual Environment**: Backend runs in a dedicated Python venv (`backend/venv`).
