# Implementation Plan: Adding Agent Blueprints to ArchVantage

This implementation plan details the steps required to introduce "Agent Tools" into the ArchVantage. This feature will allow users to drag an Agent Blueprint from the Canvas Palette onto the canvas, configure its inputs using manual or AI-assisted mapping from connected nodes, and execute the agent directly from the canvas.

## 1. Backend: AI Mapping Endpoint

To support the "automated mapping" requirement using AI, we need an endpoint similar to the MCP tool's mapping feature.

- **File**: `backend/app/routers/agent_blueprints.py`
- **Action**: Add a new endpoint `POST /agent-blueprints/suggest-mappings`
- **Details**: 
  - Takes a payload containing `inputs_schema` (the agent's input requirements) and `source_nodes` (the list of connected node data summaries).
  - Uses the LLM (via an existing prompt or service) to analyze the source nodes and output a JSON mapping `{"property_name": {"source_id": "node_id", "confidence": 0.9}}`.
  - Returns the suggested mappings to the frontend.

## 2. Frontend: Store Updates

- **File**: `frontend/src/components/semantic-canvas/canvas-store.ts`
- **Action**:
  - Update `ThingType` union type to include `"agent_tool"`.

## 3. Frontend: Canvas Palette Integration

- **File**: `frontend/src/components/semantic-canvas/canvas-palette.tsx`
- **Action**:
  - Update `ToolType` to include `"agent_tool"`.
  - Add a new entry to the `CANVAS_TOOLS` array:
    ```tsx
    {
        id: "agent_tool",
        name: "Agent Blueprint",
        icon: <Bot className="h-4 w-4" />,
        description: "Connect & execute an Agent"
    }
    ```
  - Update `DEFAULT_TOOL_COLORS` with a default color for `agent_tool` (e.g., violet/indigo).

## 4. Frontend: Canvas View Setup

- **File**: `frontend/src/components/semantic-canvas/canvas-view.tsx`
- **Action**:
  - Add state for the dialog: `const [showAgentToolDialog, setShowAgentToolDialog] = useState(false)`.
  - In `handleFileDrop`, inside the `switch (toolType)`, add a case for `"agent_tool"` to set `showAgentToolDialog(true)` and capture the `pendingDropPos`.
  - Render the `<AgentToolConfigDialog />` component alongside other dialogs in the render tree.

## 5. Frontend: Agent Tool Configuration Dialog

- **File**: `frontend/src/components/semantic-canvas/agent-tool-config-dialog.tsx` (New File)
- **Action**: Create a multi-step dialog similar to `MCPToolConfigDialog`.
  - **Step 1 (Select)**: Fetch available agents from `GET /api/v1/agent-blueprints` and display them in a list.
  - **Step 2 (Map)**: Read the selected blueprint's `inputs_schema`. Show a form where each input property can be mapped to either:
    - A manual static value.
    - An available `sourceNode` (selected via dropdown).
  - **AI Mapping**: Add an "Auto-Map with AI" button that calls the new `suggest-mappings` endpoint to auto-fill the dropdowns.
  - **Confirmation**: Upon confirm, call `addThing("agent_tool", { blueprint_id, blueprint_name, inputs_schema, argument_mappings: {...} }, position)`.

## 6. Frontend: Thing Node Updates

- **File**: `frontend/src/components/semantic-canvas/nodes/thing-node.tsx`
- **Action**:
  - Update `thingIcons` mapping to map `agent_tool` to the `Bot` icon.
  - Update `thingColors` mapping for `agent_tool` to use the `agent_result` color theme or a distinct new one.
  - In the component renderer, add support for rendering the `AgentToolViewer` when `currentThing.type === "agent_tool"`.

## 7. Frontend: Agent Tool Viewer

- **File**: `frontend/src/components/semantic-canvas/viewers/agent-tool-viewer.tsx` (New File)
- **Action**: Create the visual representation of the agent node on the canvas.
  - **Display**: Show the agent's name, description, and the configured mappings.
  - **Execute Button**: Provide a button to "Run Agent".
  - **Execution Logic**: 
    - When clicked, resolve the actual input values by fetching the content of the mapped source nodes (`useCanvasStore.getState().things`).
    - Make a call to `POST /api/v1/agent-blueprints/{blueprint_id}/execute` passing the resolved inputs.
    - Upon successful execution, automatically spawn a new node (e.g., `agent_result`) on the canvas with the execution outputs and link it from the agent node.

## Optional Enhancement

- Allow drawing an edge from a `ThingNode` directly to an `AgentNode` and automatically opening the `AgentToolConfigDialog` in "Mapping Mode" to append the new source node to the mappings.
