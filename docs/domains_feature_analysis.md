# Features Analysis: Semantic Domains

## 1. Executive Summary
The **"Domains"** feature in SemanticCanvas transforms a standard spatial canvas into a structured, data-driven environment. Unlike traditional "frames" in tools like Figma or Miro, Semantic Domains are intelligent containers that enforce governance, enable metadata inheritance, and integrate deeply with the application's AI and automation layers.

## 2.## Exhaustive List of Features and Capabilities

### 1. Spatial Container Logic
Domains serve as intelligent boundaries that define the scope of data.
- **Visual Grouping**: Nodes within a domain are visually encapsulated.
- **Hierarchical Nesting**: Domains can be nested within other domains, creating a multi-level structure (e.g., Project > Phase > Task).
    - *Implementation:* `backend/app/models/canvas_models.py` (Line 108, `parent_id`), `frontend/src/components/semantic-canvas/canvas-store.ts` (Line 123, `parent_id`).
- **Z-Order Management**: Domains maintain a specific stack order, allowing for layering of information.
    - *Implementation:* `backend/app/models/canvas_models.py` (Line 107, `z_index`), `frontend/src/components/semantic-canvas/canvas-store.ts` (Line 127, `z_index`).
- **Automatic Assignment**: Dragging a node into a domain automatically assigns it to that domain's context.
    - *Implementation:* `frontend/src/lib/layout-engine.ts` (Lines 17-135), `frontend/src/components/semantic-canvas/canvas-store.ts` (Lines 1114-1134: `recalculateDomainAssignments`).

### 2. Metadata and Governance
The intelligence of a domain comes from the metadata layer it imposes.
- **TCMS Integration**: Full integration with the Tri-Categorical Metadata System.
- **Schema Enforcement**: Domains define a metadata schema that all contained nodes can inherit or adhere to.
    - *Implementation:* `frontend/src/components/semantic-canvas/canvas-store.ts` (Line 136, `metadata_schema`).
- **Metadata Inheritance**: Contained nodes dynamically reference fields defined by their parent domain.
    - *Implementation:* `frontend/src/components/semantic-canvas/inspector-panel.tsx` (Lines 562-588: "Context Fields" UI rendering).
- **Computed Metadata (Synthesis)**: The ability to aggregate data from children (e.g., a "Total Cost" field in a domain that sums values from all contained "Resource" nodes).
    - *Implementation:* Managed via **Smart Templates**: `backend/app/services/smart_template_service.py` (Lines 646-683).
- **Missing Data Highlighting**: Mandatory fields in a domain are flagged if missing in children nodes.
    - *Implementation:* `frontend/src/components/semantic-canvas/nodes/domain-node.tsx` (Line 787: UI-level required field markers).

### 3. Interactive Drop Zones
Drop zones are specialized areas within a domain that trigger specific logic.
- **Categorical Routing**: Dropping a node into a specific zone (e.g., "Ready for Review") can automatically update its status metadata.
- **Visual Guidance**: Zones are rendered with distinct styles (e.g., dashed outlines) to guide user interaction.
    - *Implementation:* `frontend/src/components/semantic-canvas/nodes/domain-node.tsx` (Lines 282-355: `drop_zones` rendering).
- **Automation Triggers**: Entering a zone can trigger a background agent action (e.g., "Summarize and Slack to Team").
    - *Implementation:* `backend/app/services/automation_service.py` (Lines 41-258: `handle_canvas_event`, triggers Matching Rule matching via `_get_match_error`).

### 4. Layout and Presentation
Domains manage how their children are displayed.
- **Layout Modes**: Support for different organization styles, such as "Stacked" (layered) or "Tiled" (grid).
    - *Implementation:* `frontend/src/lib/layout-engine.ts` (Lines 17-135: `recalculateZoneLayout`, `calculateTiledLayout`, `calculateStackedLayout`).
- **Semantic Zoom**: As the user zooms out, domains can collapse into icons or summary views to prevent clutter.
    - *Implementation:* `frontend/src/components/semantic-canvas/canvas-store.ts` (Lines 304-319: `getZoomLevel`), `frontend/src/components/semantic-canvas/nodes/domain-node.tsx` (Lines 135-150).
- **Visual Customization**: Individual domains can have unique background colors, icons, and border styles.

### 5. Scenario-Driven Lifecycle
Domains are often provisioned and governed by Scenarios.
- **Master Board Templating**: Scenarios can pre-configure a canvas with a set of default domains.
- **Scenario Integration**: Scenario logic can define how domains react to events on the canvas.
    - *Implementation:* `backend/app/routers/canvas.py` (Lines 291-320: Merging scenario config into canvas context).

---

## Technical Innovation and Originality

The "Domains" feature in SemanticCanvas is not merely a visual grouping tool; it introduces several innovative concepts to the space of digital canvases:

### 1. The "Spatial Database" Paradigm
Traditionally, databases are relational or document-based. SemanticCanvas treats the **2D plane as the primary key of a spatial database**. A node's coordinates determine its properties, schema, and even the AI agents assigned to it. Moving a node from one domain to another is effectively a **database migration operation** executed with a simple drag-and-drop.

### 2. Domain-Aware AI Agents (Agent Sensitivity)
Unlike generic AI tools that analyze a whole document, SemanticCanvas agents are "geographically sensitive." An agent operating within a "Risk Assessment" domain receives the specific context, constraints, and metadata of that domain, allowing for highly targeted and relevant output.
- *Traceable Code:* `backend/app/services/automation_service.py` (Lines 116-119) injects domain-specific context into LLM prompts.

### 3. Dynamic Metadata Synthesis
The ability to perform real-time aggregation across a visual hierarchy. If a domain representing a "Budget Phase" contains multiple "Expense" nodes, the domain can synthesize a total budget view. This turns the canvas into a visual spreadsheet where the layout *is* the logic.

### 4. Interactive Drop Zones with Categorical Routing
Turning the canvas into a workflow engine (BPMN-like but freeform). By assigning specific "on_drop" triggers to zones, the canvas becomes a living interface for complex multi-step processes.

## Summary of Findings

The "Domains" feature transforms the canvas from a passive sketching board into an active, governed, and AI-powered data structure. It bridges the gap between freeform creativity and structured data management, enabling a new class of "Spatial Intelligence" applications.

## 4. Conclusion
The "Domains" feature is the structural backbone of the SemanticCanvas ecosystem. By combining spatial intuition with rigorous metadata governance and AI awareness, it provides a unique "Master Architecture" for complex information management.
