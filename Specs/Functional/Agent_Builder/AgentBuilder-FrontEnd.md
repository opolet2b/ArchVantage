# **Frontend Specifications: Low-Code Agent Builder UI**

## **1\. Overview**

The Frontend is a Single Page Application (SPA) built with **React**. It serves as the visual interface for the "Selectable LLM Architect" and the "Dynamic LangGraph Engine".

**Core Library Stack:**

* **Framework:** React 18+ (Vite).  
* **Visual Graph:** React Flow (or XYFlow).  
* **UI Components:** Shadcn/UI (based on Radix UI & Tailwind CSS).  
* **State Management:** Zustand (for high-performance graph state syncing).  
* **Form Management:** React Hook Form \+ Zod (for node parameter validation).

## **2\. Global Layout Structure**

The application follows a "IDE-like" 3-column layout:

| Section | Position | Function |
| :---- | :---- | :---- |
| **Header** | Top (Fixed) | Global Actions, Agent Name, LLM Selection. |
| **The Architect** | Left Sidebar (Collapsible) | Chat interface for natural language iteration. |
| **The Canvas** | Center (Main) | Infinite graph editor for logic refinement. |
| **The Inspector** | Right Sidebar (Contextual) | Property editing for selected nodes & Tool Palette. |
| **The Console** | Bottom (Collapsible) | Debugging, logs, and test execution. |

## **3\. Module Specifications**

### **3.1. The Header Bar**

* **Agent Identity:** Editable Input for Agent Name.  
* **LLM Selector:** A Dropdown menu to select the "Architect Model" (e.g., *GPT-4o, Claude 3.5 Sonnet, Local Llama 3*). This selection persists in the browser local storage or user preferences.  
* **Actions:**  
  * Save Blueprint: Commits the current JSON state to the backend.  
  * Deploy: Pushes the configuration to the production runner.  
  * Export JSON: Downloads the raw Blueprint file.

### **3.2. The Architect Interface (Left Sidebar)**

This is the entry point for the "Selectable LLM".

* **UI Components:**  
  * **Chat Feed:** Standard message history.  
  * **Tool Discovery Card (The RAG UI):**  
    * Triggered when the user intent requires tools.  
    * **Visual:** A card displaying "I found X relevant tools".  
    * **Interaction:** A list of Checkboxes (checked by default based on relevance score). The user can uncheck tools they *don't* want the Architect to use.  
    * **Action:** "Confirm Tools" button to proceed with generation.  
  * **Streaming Indicator:** Shows when the LLM is generating the JSON structure.  
  * **"Apply to Graph" Button:** When the LLM generates a blueprint, this button parses the JSON and re-renders the React Flow canvas.

### **3.3. The Visual Canvas (Center)**

Powered by **React Flow**.

* Node Types (Visual Mapping):  
  Each Primitive from the Backend Specs has a specific Visual Node component.  
  * **HTTP\_REQUEST Node:**  
    * *Header:* Method (GET/POST badge) \+ URL preview.  
    * *Body:* Status indicator (Active/Error).  
    * *Handles:* Input (Trigger), Output (Result), Error (Exception path).  
  * **CONDITION Node:**  
    * *Visual:* Diamond shape or Splitter icon.  
    * *Label:* The condition expression (e.g., amount \> 1000).  
    * *Handles:* Input (Top), True Output (Right/Green), False Output (Bottom/Red).  
  * **CALL\_TOOL Node:**  
    * *Visual:* Card with the Tool's Icon (e.g., Stripe Logo if available).  
    * *Content:* Tool Name \+ Summary of hardcoded arguments.  
  * **FOREACH Node (The Sub-Graph):**  
    * *Visual:* A "Container" node.  
    * *Interaction:* Double-clicking this node opens a **Breadcrumb View** (e.g., *Main Graph \> Foreach Item*), allowing the user to edit the logic *inside* the loop on a fresh canvas.  
* **Drag & Drop:**  
  * Users can drag nodes from the **Tool Palette** (Right Sidebar) onto the canvas.

### **3.4. The Inspector & Palette (Right Sidebar)**

This panel is contextual. It changes based on selection.

* **State A: Nothing Selected (Tool Palette)**  
  * **Search Bar:** Filter available primitives and MCP tools.  
  * **Categories:**  
    * *Primitives:* HTTP, Logic, Text, AI.  
    * *My Tools:* Custom tools created previously.  
    * *MCP Servers:* Grouped by Server (e.g., "Stripe", "Google Drive").  
  * **Interaction:** Drag items from here to the Canvas.  
* **State B: Node Selected (Node Inspector)**  
  * Displays a form corresponding to the params of the selected primitive.  
  * **Smart Inputs:**  
    * Fields support "Variable Autocomplete". Typing {{ triggers a dropdown showing available outputs from previous nodes (e.g., {{steps.http\_1.output.id}}).  
  * **Secrets Picker:**  
    * For API Keys, a secure dropdown listing keys stored in the backend (never shows the raw key).

### **3.5. The Debug Console (Bottom)**

* **Test Input:** JSON editor to provide mock inputs for the agent.  
* **Run Button:** Triggers POST /agent/dry-run.  
* **Execution Trace:**  
  * A timeline view of steps.  
  * **Visual Sync:** As the agent runs, the active node on the Canvas highlights in **Green**.  
  * **Data Inspection:** Clicking a step in the timeline shows the input and output JSON of that specific step.

## **4\. State Management Logic**

The frontend must maintain **Two Truths**:

1. **The Graph State (React Flow):** nodes and edges (UI positions, handles).  
2. **The Blueprint State (JSON DSL):** The strictly typed logic required by the backend.

**Synchronization Strategy:**

* **On Change:** Every time a node is moved, connected, or edited, a useEffect hook triggers a **Transformer Function**.  
* **Transformer:** Converts the React Flow state tree into the clean JSON DSL format (stripping UI metadata like x/y coordinates for the functional logic, but keeping them in a metadata field for saving/loading).  
* **Validation:** Before saving, the transformer runs a Zod schema validation against the Agent Blueprint JSON Schema defined in the backend specs. If invalid, the UI highlights the erroneous nodes in Red.