# **Functional and Technical Specifications: SemanticCanvas Workflow Interface**

## **1\. Overview**

The "Workflow Interface" module extends the Semantic Workbench by enabling the modeling, execution, and tracking of automated and semi-automated business processes. Designed for business users, it relies on a simplified version of the BPMN (Business Process Model and Notation) standard and natively integrates with the underlying LangGraph engine, Agents, and Form Tools of the interface.

## **2\. Functional Specifications**

### **2.1. Supported BPMN Subset (Simplified BPMN)**

To ensure accessibility for business users without sacrificing standardization, only the essential BPMN artifacts are implemented:

* **Swimlanes (Pools & Lanes):**  
  * *Lanes*: Visual partitions used to organize and categorize activities based on the actor or role responsible for them. Placing a task in a specific lane automatically assigns execution responsibility to the user(s) or role(s) bound to that lane.  
* **Events:**  
  * *Start Event*: Entry point. Can expect a "Payload" (e.g., a target document).  
  * *End Event*: Termination of the flow.  
* **Tasks (Activities):**  
  * *Service Task (Agent Task)*: Automated execution by an Agent (extraction, synthesis, MCP tool invocation).  
  * *User Task (Human-in-the-loop)*: Pauses the workflow awaiting user interaction via a "Form Tool" (e.g., validating a summary, inputting a missing parameter).  
* **Gateways:**  
  * *Exclusive Gateway (XOR)*: Conditional branching based on the output of a previous task (Logical Agent) or a user's choice.  
  * *Parallel Gateway (AND)*: Used for both **Forking** (splitting the flow into multiple concurrent paths) and **Synchronizing/Joining** (waiting for all incoming parallel branches to complete before proceeding).  
* **Sequence Flows:** Directional arrows connecting the elements.

### **2.2. The "Workflow Builder" (Creation Mode)**

Dedicated interface for designing workflow models.

* **Workspace:** Isolated React Flow canvas with a tool palette.  
  * **Lane Management**: Users can drag and drop horizontal or vertical lanes into the canvas. Dropping a task node inside a lane automatically binds the node to the lane's assigned actor/role.  
* **Lane Configuration (Identity Binding):**  
  * Selecting a lane's header opens a properties panel. The builder must assign specific **System Roles** (e.g., "Editor", "Data Analyst") or specific **Users** (e.g., "john.doe@example.com") to the lane. This explicitly defines the authorization perimeter for any User Task within that lane.  
* **Node Configuration:**  
  * Clicking a *Service Task* opens a panel to link an existing "Agent Blueprint" and map input/output variables.  
  * Clicking a *User Task* allows the selection of a "Form Tool" (dynamic GUI form) to present to the user.  
* **Validation:** Real-time syntactic verification (e.g., ensuring all Parallel Gateway forks eventually synchronize or reach an End Event, no unresolved infinite loops, and all lanes have an assigned role/user).

### **2.3. The "Workflow Tool" (Execution Mode \- On Canvas)**

Representation of an active or instantiable workflow directly in the main workspace or within a conversation.

* **Visualization:** Appears as a specific "Thing" on the canvas (a workflow card).  
* **Triggers:**  
  * *Drag & Drop*: The user drags and drops a "Document Thing" onto the workflow card. This triggers the *Start Event*, passing the document as the payload.  
  * *Manual Action*: "Play/Start" button on the card with an optional modal for input parameters.  
  * *Conversational*: An Agent in the chat can instantiate and start a workflow based on user intent (e.g., "Start the audit procedure on this file").  
* **User Interactions & Role Enforcement:**  
  * When a *User Task* is reached, the workflow transitions to a "Waiting" state.  
  * The Form Tool is displayed. Based on the **user or role explicitly assigned to the Lane** the task resides in, the system enforces Role-Based Access Control (RBAC). Only the designated users or members of the designated roles can view the actionable form inputs and submit the form. Other users will see a read-only state or a "Waiting for \[Role/User\]" badge.

### **2.4. Tracking and Monitoring (User Empowerment)**

The user must retain control and visibility over the execution.

* **Status Badges:** *Idle*, *Running*, *Waiting on User*, *Completed*, *Error*.  
* **Process Minimap:** A visual component (LOD \- Level of Detail) displaying the simplified BPMN path with the current node(s) highlighted (multiple nodes may be highlighted during parallel execution).  
* **Audit Log (Execution History):** A dropdown panel on the Workflow Tool displaying the timeline of completed tasks, gateway decisions, and links to created entities (with source citations). Includes the identity of the user who completed each User Task.  
* **Execution Controls:** Buttons to *Pause*, *Resume*, or *Abort* the instance.

## **3\. Technical Specifications**

### **3.1. Data Model (SQLite)**

Extension of the existing schema to manage workflows:

* WorkflowTemplate:  
  * id (UUID), name (String), description (String), bpmn\_json (JSON defining the topology, including lanes metadata, node-to-lane mappings, and **lane-to-role/user assignments**).  
* WorkflowInstance:  
  * id (UUID), template\_id (UUID), status (Enum: RUNNING, WAITING, COMPLETED, FAILED), current\_node\_ids (List of Strings \- updated to array to support parallel states), canvas\_id (UUID \- contextual location), state\_payload (JSON \- graph state variables).  
* WorkflowExecutionLog:  
  * instance\_id (UUID), node\_id (String), action\_type (String), executed\_by (String \- User ID for User Tasks), timestamp (DateTime), result\_data (JSON).

### **3.2. Backend Execution Architecture (FastAPI \+ LangGraph)**

The workflow engine translates the BPMN definition into a LangGraph execution graph (StateGraph).

* **BPMN to LangGraph Translation:**  
  * Each instance generates a state object (State) containing workflow variables (document payload, agent results, form responses).  
  * *Service Task* \-\> LangGraph node calling a Runnable (Existing Agent).  
  * *Exclusive Gateway* \-\> add\_conditional\_edges in LangGraph, routing the state based on a specific key in the state dictionary.  
  * *User Task* \-\> Utilizing LangGraph's **Breakpoint** mechanism. The graph stops (interrupt\_before or interrupt\_after) and saves its state to the database (via SQLite Checkpointer).  
* **Parallel Execution (AND Gateway):**  
  * *Fork (Split)*: Translated in LangGraph by mapping multiple outgoing edges from the gateway node to the subsequent parallel tasks. LangGraph executes these nodes concurrently.  
  * *Synchronization (Join)*: Translated by routing the output of parallel nodes into a single downstream node. LangGraph's state management uses reducer functions (e.g., operator.add via Annotated types) to merge the state updates from concurrent branches safely. The downstream node only executes once all its prerequisite parallel branches have resolved.  
* **Lane Translation (Actors):**  
  * Lanes and their assigned RBAC policies (list of allowed user\_ids or role\_ids) are passed as metadata into the LangGraph state. For *User Tasks*, this authorization list is injected into the breakpoint state. This explicitly instructs the backend API on which identities possess the authorization to resume the graph.  
* **Resuming after a User Task:**  
  * When a user attempts to submit the Form Tool, the frontend sends a POST request with the inputted data and the user's authentication token.  
  * The backend validates the authenticated user's ID and roles against the Lane authorization metadata stored in the breakpoint. If authorized, it updates the LangGraph state and resumes execution via graph.stream(None, config, stream\_mode="values").

### **3.3. Frontend Integration (Next.js & React Flow)**

* **Workflow Builder:**  
  * Use of custom node components (customNodes) in React Flow (e.g., BPMNStartNode, BPMNServiceNode, BPMNParallelGateway).  
  * Implementation of grouping via React Flow's parentNode feature to visually represent Lanes.  
  * Implementation of a configuration panel for the Lane component, featuring an autocomplete dropdown connected to the system's User/Role API for identity assignment.  
  * Serialization of the React Flow graph (nodes, edges, lanes, and lane\_assignments) into the proprietary JSON format stored in WorkflowTemplate.bpmn\_json.  
* **Workflow Tool (Instance on Canvas):**  
  * New node type in the main canvas: WorkflowInstanceNode.  
  * **Drag & Drop Handler:** Implementation of onDrop on the component. Detects the dropped object type. If it's a document node, it extracts the document ID, makes a POST /api/workflows/{id}/start API call with the document ID, and changes the UI state to "Running".  
* **WebSockets / SSE (Server-Sent Events):**  
  * Essential for reflecting real-time progress. The FastAPI backend pushes events (update of current\_node\_ids, status change). The React component consumes these to animate the minimap (highlighting multiple paths during parallel execution) and populate the Audit Log without requiring a manual refresh.

### **3.4. API Endpoints (RESTful)**

* POST /api/workflows/templates: Create a new workflow model.  
* GET /api/workflows/templates/{id}: Retrieve the BPMN/JSON definition.  
* POST /api/workflows/instances/start: Instantiate a workflow (Accepts template\_id and initial\_payload).  
* POST /api/workflows/instances/{id}/resume: Resume execution after a User Task. Performs a strict Lane-based RBAC check against the authenticated user before accepting the Form Tool data.  
* GET /api/workflows/instances/{id}/status: Retrieve current status, execution logs, and pending user authorizations.  
* POST /api/workflows/instances/{id}/abort: Prematurely terminate the process.

### **3.5. Security and Governance**

* **RBAC & Lanes:** Lane assignments enforce strict execution roles at the task level during runtime. The backend API fundamentally rejects execution attempts from unauthorized identities at the LangGraph breakpoint layer.  
* **Template Authorization:** Authorizations to instantiate a workflow are inherited from the Domain/Canvas permissions where it is invoked. Modifying a Template requires an Editor/Admin role.  
* **Isolation:** Database and vector operations executed by the workflow's Service Tasks are strictly confined within the namespace (Vector Isolation) of the canvas where the instance was started.