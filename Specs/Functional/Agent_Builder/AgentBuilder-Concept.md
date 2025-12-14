# **Project Specifications: Low-Code AI Agent Builder Platform**

## **1\. Executive Summary**

This project aims to build a comprehensive **Low-Code AI Agent Builder**. The platform allows users to create complex, stateful AI Agents via a dual interface: a natural language chat for initialization and a visual graph editor for refinement.

The system distinguishes between **"Tools"** (atomic, stateless functional units wrapping MCP servers) and **"Agents"** (complex, stateful workflows combining tools and logic). The execution engine is powered by **LangGraph** (Python), using a dynamic interpreter to execute declarative JSON blueprints.

## **2\. Core Concepts & Definitions**

### **2.1. The "Tool" (Atomic Unit)**

* **Definition:** A lightweight, semi-declarative agent designed to perform specific functional tasks.  
* **Characteristics:** Stateless, deterministic, execution-focused.  
* **Mechanism:** It acts as a wrapper around one or more **MCP (Model Context Protocol)** server functions.  
* **Creation:** The user selects available MCP functions; the system assists in generating the system prompt.

### **2.2. The "Agent" (Workflow Unit)**

* **Definition:** A complex entity capable of orchestration, reasoning, and multi-step execution.  
* **Characteristics:** Stateful, supports branching logic, loops, memory, and error handling.  
* **Mechanism:** Defined by a **JSON Blueprint** (Directed Graph) and executed by a dynamic **LangGraph** runtime.  
* **Creation:** Generated via Natural Language (LLM Architect) and edited via a Visual Graph UI.

## **3\. System Architecture**

### **3.1. High-Level Data Flow**

1. **User Intent:** User describes the desired Agent in natural language.  
2. **Tool Discovery (RAG):** System retrieves relevant Tools (Internal & MCP) via vector search.  
3. **Architectural Generation:** A **Selectable LLM** generates a JSON Blueprint based on the intent and discovered tools.  
4. **Visual Visualization:** The Frontend renders the JSON as an interactive Graph (Nodes & Edges).  
5. **Refinement:** User modifies the graph (drag-and-drop, parameter editing).  
6. **Execution:** The Backend instantiates a LangGraph workflow dynamically based on the JSON definition.

### **3.2. Component Stack**

* **Frontend:** React, React Flow (for graph visualization), Shadcn/UI.  
* **Backend:** Python (FastAPI/Django).  
* **Workflow Engine:** LangGraph.  
* **Integration Standard:** Model Context Protocol (MCP).  
* **Databases:**  
  * *Relational (PostgreSQL):* Storing Agent/Tool configurations and users.  
  * *Vector (Pinecone/Qdrant/pgvector):* Storing semantic embeddings of Tools for discovery.

## **4\. Functional Requirements**

### **4.1. The "Selectable LLM" Architect**

The core intelligence responsible for translating user prompts into JSON Blueprints must be model-agnostic.

* **Requirement:** The system must allow the administrator or user to select the underlying LLM used for blueprint generation.  
* **Supported Models:** The interface must support switching between major providers (e.g., OpenAI, Anthropic, Google) or local models (via Ollama/vLLM) provided they support structured output or strictly follow system prompts.  
* **System Prompt:** The LLM must be primed with the "Tool Architect" system prompt defined in the design phase, enforcing strict JSON output without code generation.

### **4.2. Tool Discovery Engine (RAG)**

To prevent context overflow, the Builder must intelligently select tools.

* **Ingestion:** Periodically scan connected MCP servers and Internal Tools.  
* **Vectorization:** Generate embeddings for tools based on enriched text (Name \+ Description \+ Arguments \+ Synthetic User Questions).  
* **Retrieval:** On user prompt, perform semantic search to retrieve the Top-K (e.g., Top 10\) most relevant tools.  
* **Injection:** Inject only these Top-K tools into the Selectable LLM's context window.

### **4.3. Visual Graph Editor**

The user interface for modifying the Agent's logic.

* **Visualization:** Render the JSON Blueprint as nodes and edges.  
* **Manipulation:**  
  * Add/Remove Nodes.  
  * Connect/Disconnect Edges.  
  * Configure Node Parameters (e.g., changing an API URL or a condition threshold).  
* **Synchronization:** Any change in the UI must update the underlying JSON Blueprint state.

### **4.4. Dynamic Execution Engine**

The backend component that runs the agents.

* **Dynamic Graph Construction:** A Python factory that reads the JSON Blueprint and constructs a LangGraph.StateGraph at runtime.  
* **State Management:** Maintain execution state (variables, history) across steps.  
* **Primitives Library:** Implementation of the core node types (see Section 5).

## **5\. The "Standard Primitives" Library**

The Agent Builder relies on a finite set of safe, pre-coded primitives. The LLM cannot invent code; it can only configure these blocks.

| Primitive Type | Description | Key Parameters |
| :---- | :---- | :---- |
| **HTTP\_REQUEST** | Performs a REST API call. | method, url, headers, body |
| **CALL\_TOOL** | Invokes a defined "Tool" (Internal or MCP). | tool\_id, arguments (map) |
| **CONDITION** | Logic branching (If/Else). | expression, true\_target, false\_target |
| **JSON\_MAPPING** | Transforms/Extracts data from JSON. | source, template (JMESPath/JSONPath) |
| **TEXT\_TEMPLATE** | Formats text strings/messages. | template\_string, variables |
| **FOREACH** | Iterates over a list. | items, iterator\_var, subprocess\_graph |
| **LLM\_DECISION** | Uses an LLM for routing/reasoning. | model, instruction, input\_context |

## **6\. Data Specifications (DSL)**

### **6.1. Agent Blueprint JSON Schema**

This schema defines the storage format for an Agent.

{  
  "agent\_id": "uuid",  
  "name": "string",  
  "description": "string",  
  "version": "1.0",  
  "graph": {  
    "nodes": \[  
      {  
        "id": "node\_unique\_id",  
        "type": "PRIMITIVE\_TYPE", // e.g., "HTTP\_REQUEST", "CALL\_TOOL"  
        "metadata": {  
          "label": "Display Name",  
          "ui\_position": { "x": 0, "y": 0 }  
        },  
        "params": {  
          // Specific to the Primitive Type  
          "url": "\[https://api.example.com\](https://api.example.com)",  
          "method": "GET"  
        }  
      }  
    \],  
    "edges": \[  
      {  
        "id": "edge\_unique\_id",  
        "source": "node\_id\_a",  
        "target": "node\_id\_b",  
        "condition": "optional\_expression" // For conditional branching  
      }  
    \]  
  },  
  "inputs\_schema": { ... }, // Variables required to start the agent  
  "secrets\_requirements": \[ "STRIPE\_KEY", "OPENAI\_KEY" \]  
}

## **7\. Security & Compliance**

### **7.1. Code Safety**

* **No Arbitrary Code:** The system explicitly forbids the execution of user-generated or LLM-generated Python/JS code on the host.  
* **Strict Primitives:** Execution is limited strictly to the "Standard Primitives" library.

### **7.2. Network Security (SSRF Protection)**

* **Egress Proxy:** All HTTP\_REQUEST calls executed by the backend must route through a secure Egress Proxy (e.g., Smokescreen).  
* **Blocklist:** The proxy must block access to:  
  * localhost / 127.0.0.1  
  * Private IP ranges (10.0.0.0/8, etc.)  
  * Cloud Metadata services (e.g., 169.254.169.254).

### **7.3. Secret Management**

* Secrets (API Keys) are injected at runtime via the {{secrets.KEY\_NAME}} syntax.  
* Secrets are stored encrypted in the database and never exposed in the Blueprint JSON or the Frontend UI.