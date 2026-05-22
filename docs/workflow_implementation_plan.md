# Implementation Plan: SemanticCanvas Workflow Interface & Execution Engine

This implementation plan outlines the structural, database, and functional additions required to introduce the **Workflow Interface** (Creation & Execution Mode) to the Semantic Workbench. This module allows users to visually model simplified BPMN processes, bind execution lanes to roles and identities, and execute complex automated/semi-automated tasks powered by FastAPI, LangGraph, and React Flow.

---

## 1. Executive Summary & Design Principles

The Workflow feature enables **business process automation** directly inside the spatial spatial workspace. Workflows bridge the gap between human input (User Tasks) and autonomous AI capabilities (Agent Service Tasks).

### Core Architectural Decisions:
1. **Unified Storage & DB Configuration**: All models are persisted in `backend/db/sql_app.db` (per repository conventions).
2. **LangGraph State Graph & Breakpoints**: Workflows are translated dynamically to a LangGraph `StateGraph`. A `User Task` leverages LangGraph's standard **Breakpoint** mechanism (`interrupt_before`), persisting the graph state via the **SQLite Checkpointer** and yielding control back to the human-in-the-loop.
3. **Strict Lane-Based RBAC**: Lanes enforce user identity or role-based boundaries on the frontend and backend. The backend strictly rejects attempts to resume a breakpoint if the authenticated user's ID/Roles do not match the Lane metadata.
4. **Real-time Push (SSE)**: Backend state updates are pushed to the client using **Server-Sent Events (SSE)**, ensuring real-time highlights of active nodes on the minimap and logs.
5. **Vector Isolation & Contextual Safety**: Any RAG/vector query executed within an Agent Task is strictly confined to the `Canvas` namespace and uses `backend/chroma_db` as the location for ChromaDB vector operations.
6. **Code Standards**: All Python components must follow the **PEP 8 Style Guide** and feature extensive, clean docstrings.

---

## 2. Database Schema Extension (SQLite)

We will define new SQLAlchemy models in a new file `backend/app/models/workflow.py`. The tables map workflow templates, runtime instances, and logs.

```python
"""
Workflow Models

Database models for modeling, running, and tracking BPMN-like processes.
Adheres to PEP 8 coding standards and repository structures.
"""
from sqlalchemy import Column, String, Integer, DateTime, ForeignKey, JSON, Enum as SQLEnum
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import enum
from uuid import uuid4
from app.core.database import Base

class WorkflowStatus(str, enum.Enum):
    IDLE = "IDLE"
    RUNNING = "RUNNING"
    WAITING = "WAITING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"

class WorkflowTemplate(Base):
    """
    Blueprint representing a modeled BPMN workflow configuration.
    Stored in JSON topology format (lanes, custom nodes, edges).
    """
    __tablename__ = "workflow_templates"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid4()))
    name = Column(String(255), nullable=False)
    description = Column(String(1000), nullable=True)
    
    # Store complete BPMN configuration (JSON topology with lanes, nodes, connections, and metadata)
    bpmn_json = Column(JSON, nullable=False, default={})
    
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    last_modified = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships
    creator = relationship("User", foreign_keys=[created_by])
    instances = relationship("WorkflowInstance", back_populates="template", cascade="all, delete-orphan")


class WorkflowInstance(Base):
    """
    Runtime execution state of a specific workflow template.
    Tracks state payload and active concurrent graph breakpoints.
    """
    __tablename__ = "workflow_instances"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid4()))
    template_id = Column(String(36), ForeignKey("workflow_templates.id", ondelete="CASCADE"), nullable=False)
    canvas_id = Column(String(36), ForeignKey("canvases.id", ondelete="CASCADE"), nullable=False)
    
    status = Column(SQLEnum(WorkflowStatus), default=WorkflowStatus.IDLE, nullable=False)
    
    # Track parallel execution states (JSON Array of strings, e.g. ["task_node_1", "task_node_2"])
    current_node_ids = Column(JSON, default=[], nullable=False)
    
    # State payload carrying document refs, agent findings, form data
    state_payload = Column(JSON, default={}, nullable=False)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    template = relationship("WorkflowTemplate", back_populates="instances")
    canvas = relationship("Canvas")
    logs = relationship("WorkflowExecutionLog", back_populates="instance", cascade="all, delete-orphan")


class WorkflowExecutionLog(Base):
    """
    Audit log record of actions executed within a workflow.
    Tracks gateway branching decisions, human validations, and errors.
    """
    __tablename__ = "workflow_execution_logs"

    id = Column(Integer, primary_key=True, index=True)
    instance_id = Column(String(36), ForeignKey("workflow_instances.id", ondelete="CASCADE"), nullable=False)
    node_id = Column(String(100), nullable=False)
    
    # e.g., "ENTER_NODE", "EXIT_NODE", "PAUSE_BREAKPOINT", "RESUME_NODE", "ERROR"
    action_type = Column(String(50), nullable=False)
    
    # Tracks who performed the action (User ID for human tasks, or 'system' for Agents)
    executed_by = Column(String(255), nullable=True)
    
    timestamp = Column(DateTime(timezone=True), server_default=func.now())
    
    # Stores action-specific results, output notes, error traces
    result_data = Column(JSON, nullable=True)

    # Relationships
    instance = relationship("WorkflowInstance", back_populates="logs")
```

---

## 3. Backend Execution Architecture (FastAPI + LangGraph)

The core engine transforms visual BPMN topologies into runnable `StateGraph` architectures.

### 3.1. LangGraph State & Execution Flow
The standard state tracks the graph variables, history, and metadata:

```python
from typing import Dict, Any, List, TypedDict, Annotated
import operator

class WorkflowState(TypedDict):
    # Standard values passed between nodes
    variables: Dict[str, Any]
    # Thread history logs
    history: Annotated[List[Dict[str, Any]], operator.add]
    # Track currently active node boundaries
    active_nodes: List[str]
```

### 3.2. Mapping BPMN Elements to LangGraph Mechanics

#### 1. Service Tasks (Agents)
Service tasks run automatically. They:
- Link to an existing `AgentBlueprint`.
- Respect custom selected model settings from the canvas workspace (adhering to `RULE[always-use-llm-config.md]`).
- Execute isolated RAG searches strictly in `backend/chroma_db` under the current `canvas_id`.
- Output variables that merge back into the main `WorkflowState["variables"]` registry.

#### 2. Exclusive Gateways (XOR)
XOR nodes branch based on variables using standard conditional routing:
```python
workflow_graph.add_conditional_edges(
    "exclusive_gateway_1",
    decide_routing_path,
    {
        "approved": "service_task_compile",
        "rejected": "user_task_revision"
    }
)
```

#### 3. Parallel Gateways (AND Fork/Join)
- **Fork (Split)**: Implemented in LangGraph by routing multiple outgoing edges from the gateway node. For example:
  ```python
  workflow_graph.add_edge("parallel_gateway_fork", "service_task_sentiment")
  workflow_graph.add_edge("parallel_gateway_fork", "service_task_summarization")
  ```
- **Join (Merge)**: The synchronizing parallel join waits until all prerequisite branches publish their state updates. We will write custom reducer functions (e.g. `operator.add`) inside the `WorkflowState` or maintain a synchronization registry key in state payload to track completed parent tasks.

#### 4. User Tasks (Human-in-the-Loop)
- Utilizes LangGraph's native **Breakpoint** mechanism.
- The compiled graph is marked with `interrupt_before=["user_task_node_id"]`.
- When reached, execution automatically halts, saves the state snapshot using `SqliteSaver` (Checkpointer), and changes `WorkflowInstance.status` to `WAITING`.
- Stores target lane RBAC configuration in metadata so only authorized users can submit responses.

---

## 4. RESTful API Design

The API endpoints will be registered under `backend/app/routers/workflow.py`.

```
========================================================================================
Endpoint                               Method   Payload / Query         Auth / Check
========================================================================================
POST /api/workflows/templates          POST     WorkflowTemplateCreate  Editor / Admin
PUT  /api/workflows/templates/{id}      PUT      WorkflowTemplateUpdate  Editor / Admin
GET  /api/workflows/templates/{id}      GET      -                       Read Canvas
POST /api/workflows/instances/start    POST     WorkflowInstanceCreate  Write Canvas
GET  /api/workflows/instances/{id}      GET      -                       Read Canvas
POST /api/workflows/instances/{id}/resume POST   WorkflowResumePayload   Lane-Based RBAC
POST /api/workflows/instances/{id}/abort  POST   -                       Write Canvas
========================================================================================
```

### 4.1. Strict Lane-Based RBAC Resume Verification Flow
When a user attempts to resume a paused workflow (submitting a User Form Tool):
1. Authenticate the request and retrieve `current_user` (and their `roles`).
2. Load the target `WorkflowInstance` and its corresponding template definition.
3. Locate the currently active `User Task` and retrieve its parent **Lane** configuration.
4. Check Lane configuration for:
   - **Allowed System Roles** (e.g., `["Editor", "Data Analyst"]`).
   - **Allowed User Emails** (e.g., `["john.doe@example.com"]`).
5. **Enforce Policy**: If the `current_user`'s ID or Roles do not match the allowed metadata, reject the request with `HTTP 403 Forbidden`.
6. If verified, update the graph state payload and trigger the LangGraph SQLite checkpointer to resume processing.

---

## 5. Frontend Architecture (React Flow & Next.js)

### 5.1. The Workflow Builder (Creation Mode)
The Workflow Builder operates inside `frontend/src/components/workflow-editor.tsx` as an isolated React Flow space.

#### 1. Custom BPMN Node Renderers
We will introduce visual-rich custom nodes to `@xyflow/react` node definitions:
- **`BPMNStartNode`**: Sleek circle, highlights green on hover, displays inputs.
- **`BPMNServiceNode`**: Rounded block with cognitive visual styles (indigo borders, bot icon), showing linked Agent blueprint.
- **`BPMNUserNode`**: Rounded block styled in warm orange, showing human icon and the name of the assigned Form Tool.
- **`BPMNGatewayNode`**: Diamond-shaped node. Exclusive (XOR) displays an 'X'; Parallel (AND) displays a '+'.

#### 2. Swimlane Visual Container Components
Lanes are mapped using React Flow's **Parent-Child Grouping** (`parentNode` attribute).
- Dragging a lane onto the canvas positions a styled horizontal/vertical lane container.
- Nodes dropped inside the lane are visually bound to it and updated with their `parentNode` reference.
- Selecting a Lane header reveals a configuration drawer where a dropdown queries system roles and user accounts (connected to `/api/users` and `/api/roles`) to configure the lane's perimeter.

#### 3. Real-Time Graph Validation
A background validation worker checks:
- No unresolved gateways.
- All Parallel forks successfully rejoin.
- Every lane has an identity or role bound to it.
- All nodes have a valid connection path to `EndNode`.

---

### 5.2. Canvas Workflow Tool (Execution Mode)

#### 1. Visual Representation on Spatial Canvas
A new custom canvas element `WorkflowInstanceNode` is rendered on the primary canvas. It displays:
- The template name and description.
- Status Badge: *Idle*, *Running*, *Waiting on User*, *Completed*, or *Error* (styled with vibrant glassmorphism borders and custom glow shadows).
- Mini-controls: Pause, Start, Resume, and Abort buttons.

#### 2. Drag & Drop Event Hooks
Users can drag a `Document Thing` from the canvas palette or folder list directly onto the `WorkflowInstanceNode` card:
- Handles standard React `onDrop` events.
- Validates the node type (requires `document`).
- Calls `POST /api/workflows/instances/start` passing the document identifier as the graph payload.

#### 3. Interactive User Task Forms & RBAC Enforcement
- When a `User Task` is waiting, the card renders the dynamic Form Tool.
- The UI queries the current user's profile. If the user **does not match the Lane RBAC criteria**, the form inputs are disabled, displaying a clear message: `"Read-only: Awaiting review by [Role/User]"`.
- If authorized, the form is interactive, allowing data entry and featuring a primary `"Submit & Resume Workflow"` action button.

#### 4. Real-time Progress Tracking (SSE or WebSockets)
- The FastAPI backend broadcasts state updates whenever a node starts or completes execution.
- **Visual Process Minimap (LOD)**: A simplified interactive BPMN roadmap overlay lights up active paths with pulse animations. Supports concurrent high-intensity highlights for parallel execution steps.
- **Audit Log Panel**: An expandable history drawer maps chronological step timelines, displaying gateway route decisions, timestamps, agent output citations, and the identity of the user who completed each Human-in-the-loop task.

---

## 6. Detailed Implementation Steps & Phases

### Phase 1: Core Database Models & Schema Migrations
1. Create `backend/app/models/workflow.py` containing `WorkflowTemplate`, `WorkflowInstance`, and `WorkflowExecutionLog` schemas.
2. Add imports in `backend/app/models/__init__.py`.
3. Generate SQLite-compatible migrations to update `sql_app.db` automatically on startup.
4. Establish corresponding Pydantic validation schemas in `backend/app/schemas/workflow.py`.

### Phase 2: LangGraph Translation Engine
1. Implement the `WorkflowService` in `backend/app/services/workflow_service.py` to translate `bpmn_json` topology maps into `StateGraph` nodes.
2. Integrate standard breakpoint settings to pause at User Tasks.
3. Configure the custom `SqliteSaver` checkpointer pointing directly to `backend/db/sql_app.db` to save execution threads.
4. Build variable resolution utilities:
   - Map Service Task inputs from previous node execution values.
   - Resolve ChromaDB searches in `backend/chroma_db` scoped by the current canvas namespace.

### Phase 3: RESTful API & Authorizations
1. Refactor `backend/app/routers/workflow.py` with standard CRUD endpoints.
2. Integrate permission checker requirements (e.g. `Depends(PermissionChecker("canvas:write"))`).
3. Build the backend RBAC validation guard in `/instances/{id}/resume` to verify request headers against target Lane role/user rules.

### Phase 4: Frontend Builder & Custom Nodes
1. Expand custom node schemas in `frontend/src/components/workflow-editor.tsx`.
2. Style custom visual renderers for start/end nodes, exclusive/parallel gateways, service tasks, and user tasks.
3. Add Lane grouping using React Flow `parentNode` behaviors.
4. Create the Lane Drawer configuring allowed roles/users via an autocomplete selector drawer.

### Phase 5: Canvas Workflow Node & Interactive Triggers
1. Add `workflow_instance` to the spatial canvas types.
2. Create `WorkflowInstanceNode` to display active progress, minimap highlights, and status indicators.
3. Build Drag-and-Drop handler on `WorkflowInstanceNode` to initialize processes.
4. Create the Form Tool renderer within `WorkflowInstanceNode` with read-only/interactive modes based on user profile checks.

### Phase 6: Real-time Updates & Event Streaming
1. Add a FastAPI Server-Sent Events (SSE) `/instances/{id}/stream` endpoint pushing updates from the LangGraph execution thread.
2. Connect the React client to the SSE endpoint to dynamically animate active paths on the minimap and push new steps to the Audit Log.

---

## 7. Compliance with Project Core Rules

To ensure total consistency with this repository, the implementation strictly adheres to all user-defined constraints:
- **LLM Selection**: Execution of AI Service Tasks reads the active model selection configurations directly from the canvas workspace panel.
- **ChromaDB**: All vector actions are isolated inside `backend/chroma_db`.
- **Database Path**: All transactions take place within the SQLite database located at `backend/db/sql_app.db`.
- **Virtual Environment**: All workspace installations, testing commands, and executions are carried out within `backend/venv`.
- **PEP 8 Compliance**: Code is designed with detailed docstrings, correct indentation, and type hints.
- **Documentation**: This plan is stored in the dedicated `/docs` directory at `docs/workflow_implementation_plan.md`.
