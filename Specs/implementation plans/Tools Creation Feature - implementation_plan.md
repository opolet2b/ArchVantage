# Tools Creation Feature Implementation Plan

## Goal Description
Implement the "Tools creation" feature as specified in `Specs/Tools-Specs.md`. This includes a new "Tools" section in the sidebar, a tool library view, a tool editor with MCP integration, and backend support for managing tools and executing them via MCP.

## User Review Required
> [!IMPORTANT]
> This feature requires installing the `mcp` package in the backend.
> The "Tools" menu item will be added to the sidebar.

## Proposed Changes

### Backend

#### [MODIFY] [requirements.txt](file:///c:/Users/opole/Downloads/ChatBotn/backend/requirements.txt)
- Add `mcp` package.

#### [NEW] [backend/app/models/tools.py](file:///c:/Users/opole/Downloads/ChatBotn/backend/app/models/tools.py)
- Define `Tool` model (id, name, description, category_id, configuration, owner_id, etc.).
- Define `Category` model (id, name, description).
- Define `ToolPermission` model (tool_id, user_id/group_id, permission_level).

#### [NEW] [backend/app/schemas/tools.py](file:///c:/Users/opole/Downloads/ChatBotn/backend/app/schemas/tools.py)
- Define Pydantic models for Tool, Category, and ToolPermission (Create, Update, Read).

#### [NEW] [backend/app/services/tools.py](file:///c:/Users/opole/Downloads/ChatBotn/backend/app/services/tools.py)
- Implement logic for creating, updating, deleting tools.
- Implement MCP client integration to discover tools and execute them.
- Implement runtime wrapper for tool execution (JSON-RPC 2.0).

#### [NEW] [backend/app/routers/tools.py](file:///c:/Users/opole/Downloads/ChatBotn/backend/app/routers/tools.py)
- Define endpoints for:
    - GET /tools (list tools)
    - POST /tools (create tool)
    - GET /tools/{id} (get tool details)
    - PUT /tools/{id} (update tool)
    - DELETE /tools/{id} (delete tool)
    - GET /categories (list categories)
    - POST /categories (create category - admin only)
    - POST /tools/{id}/execute (execute tool)
    - GET /mcp/servers (list available MCP servers - mock or config based)

#### [MODIFY] [backend/main.py](file:///c:/Users/opole/Downloads/ChatBotn/backend/main.py)
- Include `tools.router`.

### Frontend

#### [MODIFY] [frontend/src/components/sidebar/app-sidebar.tsx](file:///c:/Users/opole/Downloads/ChatBotn/frontend/src/components/sidebar/app-sidebar.tsx)
- Add "Tools" menu item below "Agents".

#### [NEW] [frontend/src/app/tools/page.tsx](file:///c:/Users/opole/Downloads/ChatBotn/frontend/src/app/tools/page.tsx)
- Implement the main Tools page with Tool Library View.

#### [NEW] [frontend/src/components/tools/tool-list.tsx](file:///c:/Users/opole/Downloads/ChatBotn/frontend/src/components/tools/tool-list.tsx)
- Component to display the list of tools with filtering.

#### [NEW] [frontend/src/components/tools/tool-editor.tsx](file:///c:/Users/opole/Downloads/ChatBotn/frontend/src/components/tools/tool-editor.tsx)
- Component for creating/editing tools (Master-Detail view).
- Drag & Drop interface for MCP integration.

#### [NEW] [frontend/src/components/tools/mcp-server-list.tsx](file:///c:/Users/opole/Downloads/ChatBotn/frontend/src/components/tools/mcp-server-list.tsx)
- Component to list available MCP servers for drag & drop.

## Verification Plan

### Automated Tests
- Create `backend/test_tools.py` to test:
    - Tool creation, retrieval, update, deletion.
    - Category management.
    - Tool execution (mocking MCP server).
- Run tests using `pytest backend/test_tools.py`.

### Manual Verification
1.  **Navigation**: Verify "Tools" link appears in the sidebar and navigates to `/tools`.
2.  **Tool Library**: Verify the list of tools is displayed and can be filtered by category.
3.  **Tool Creation**:
    - Click "+" button.
    - Verify Tool Editor opens.
    - Drag an MCP server to the canvas.
    - Select functions.
    - Enter description and generate system prompt (mocked if LLM not available).
    - Save the tool.
4.  **Tool Execution**:
    - (If possible via UI or API) Execute the created tool and verify the output.
