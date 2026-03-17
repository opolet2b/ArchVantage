# SemanticCanvas Functional Specifications

## 1. Introduction
SemanticCanvas is a high-performance, visually rich spatial computing environment designed for advanced knowledge management, AI-driven analysis, and complex workflow orchestration. Unlike traditional chat interfaces, SemanticCanvas leverages a spatial metaphor to organize information, allowing users to "think in space" and interact with data through semantic zooming and direct manipulation.

### 1.1 Mission Statement
To provide an intuitive, powerful platform that bridges the gap between raw data and actionable insights through spatial reasoning and agentic automation.

---

## 2. System Architecture
The application follows a modern cloud-native architecture with a clean separation between the frontend interface and the backend processing engine.

### 2.1 Technology Stack
- **Frontend**: Next.js, React Flow (for canvas visualization), Shadcn/UI, Tailwind CSS (where requested), Lucide-react for iconography.
- **Backend**: FastAPI (Python), LangGraph/LangChain (for agentic logic), LlamaIndex (for RAG and data ingestion), ChromaDB (Vector Store), SQLite (Application DB).
- **AI/ML**: Integration with various LLMs (GPT-4o, Claude 3.5 Sonnet, etc.) and local models via Ollama. Support for Vision-Language Models (VLM) for multimodal analysis.

---

## 3. Core Features

### 3.1 Semantic Canvas
The central interface where all interactions occur.
- **Spatial Organizing**: Users can place "Things" (Nodes) anywhere on a theoretically infinite canvas.
- **Semantic Zooming**: Dynamic level-of-detail management. As users zoom out, nodes condense into high-level summaries. As they zoom in, they reveal detailed content, metadata, and controls.
- **Hierarchical Nesting (Domains)**: Domains act as folders or contexts that can contain nodes and other domains. They support metadata inheritance and specialized "drop zones."
- **Direct Manipulation**: Draggable nodes, resizable containers, and interactive links.

### 3.2 Things (Nodes)
The basic units of information.
- **Types**: Text, Document, Image, Video, URL, Chat, Agent, and Workflow.
- **Summarization**: Automatic multi-level summarization (Label, One-liner, Sentence, Paragraph) for semantic zoom.
- **Citation Engine**: Robust matching for Knowledge Base citations, ensuring transparency and accuracy in AI-generated content.

### 3.3 Agents and Workflows
The automation powerhouse of the platform.
- **Agent Blueprints**: JSON-defined execution graphs using LangGraph. Agents can perform research, extraction, synthesis, and tool execution.
- **Primitives**: Reusable logic blocks (Ask AI, Logic If/Else, Pipeline, Extractor, Visualizer, etc.) that form the building blocks of agents.
- **Drop Zones**: Interactive areas in Domains that trigger specific automations (e.g., "Analyze as PESTEL") when a node is dropped onto them.

### 3.4 RAG & Knowledge Base
Sophisticated Data Augmentation.
- **Ingestion Pipeline**: Multi-format support (.pdf, .docx, .pptx, URLs, images).
- **Hybrid VLM Enrichment**: Uses VLMs to describe visual elements (charts, diagrams) in documents, making them searchable and understandable by text-based LLMs.
- **Search & Retrieval**: High-performance semantic search using ChromaDB and LlamaIndex.

---

## 4. Advanced Intelligence Suite

### 4.1 Smart Analysis
Specialized analytical workflows tailored for business and technical domains.
- **Framework Analysis**: Pre-configured pipelines for PESTEL, SWOT, Porter's Five Forces, and more.
- **Context-Aware Insights**: Analysis that takes into account the domain metadata and linked entities on the canvas.

### 4.2 Smart Templates
An iterative, quality-focused document generation system.
- **Multi-Phase Pipeline**: 
    1. **Drafting**: AI generates an initial version based on instructions and context.
    2. **Auditing**: A dedicated "Auditor" agent reviews the draft against quality metrics (Accuracy, Reasoning, Relevance, Clarity).
    3. **Refinement**: An "Editor" agent rewrites sections based on auditor feedback to reach a target quality score.
- **Iterative Loops**: Configurable quality thresholds and maximum iteration cycles to ensure high-fidelity outputs.

### 4.3 Knowledge Base & Ontology
A structured approach to information retrieval and semantic relationship mapping.
- **Ontology Management**: Support for defining custom taxonomies (Classes) and predicates (Relationships).
- **AI-Driven Extraction**: Automatic extraction of ontology structures from unstructured text sources (local files, URLs).
- **Graph Database (ArcadeDB)**: Storage of the semantic graph, allowing for complex relationship traversal and improved RAG accuracy.
- **Ontology Inheritance**: Domains can inherit or override ontology definitions for local context.

### 4.4 Tools & Integrations
Extending the AI's capabilities through external actions.
- **MCP (Model Context Protocol)**: Seamless integration with third-party tools and data sources via standardized MCP servers.
- **GUI-Based Tools**: Frontend-defined forms that allow agents to collect structured user input or trigger visual actions.
- **Permissions & Security**: Granular access control for tools at the user and group level.

---

## 5. User Interface & UX
SemanticCanvas prioritizes a "premium" and "alive" feel.
- **Design System**: Harmonious color palettes, glassmorphism, and smooth micro-animations.
- **Dynamic Feedback**: Real-time progress indicators for agent execution, heartbeats for LLM calls, and visual state changes for RAG processing.
- **Contextual Tools**: Toolbar and context menus that adapt based on the selected item and active Scenario.

---

## 6. Data & Architecture
### 6.1 Data Models
- **SQL Database (SQLite)**: Stores canvas state, user configs, scenarios, agent definitions, and "Tool" metadata.
- **Vector Database (ChromaDB)**: Stores embeddings for semantic search.
- **Graph Database (ArcadeDB)**: Maintains the ontology and semantic relationships.

### 6.2 External Integrations
- **LLM/VLM Providers**: Configurable presets for OpenAI, Anthropic, and local Ollama instances.
- **MCP Servers**: Managed connections to external tool providers.

---

## 7. Security and Performance
- **Role-Based Access Control (RBAC)**: Granular permissions for canvases, tools, and administrative settings.
- **Asynchronous Execution**: Backend tasks (vectorization, agent runs, smart analysis) are handled asynchronously with real-time status updates.
- **Database Maintenance**: Integrated services for VACUUMING, re-indexing, and disk monitoring.
