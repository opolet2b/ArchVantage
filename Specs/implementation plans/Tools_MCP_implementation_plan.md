# MCP Tools Discovery Feature

## Goal
When a user drags an MCP server onto the Tool Canvas, automatically discover and display the server's tools, allowing the user to select which ones to include.

## Proposed Changes

### Frontend

#### [MODIFY] [tool-editor.tsx](file:///c:/Users/opole/Downloads/ChatBotn/frontend/src/components/tools/tool-editor.tsx)

1. **Add `DiscoveredTool` interface** for tools fetched from MCP server
2. **Update `handleDrop`** to call the test-connection API and fetch tools
3. **Store tools with each connected server** (extend MCPServer to include discovered tools)
4. **Add selection state** to track which tools are selected
5. **Update the canvas UI** to show tools with checkboxes and descriptions
6. **Pass selected tools** to the prompt generation function

### Backend

No backend changes needed - the `/test-connection` endpoint already returns tools.

---

## UI Flow

1. User drags MCP server to canvas
2. Loading indicator shows while discovering tools
3. Server card expands to show discovered tools with:
   - Checkbox for selection
   - Tool name
   - Tool description
4. User selects relevant tools
5. "Generate with AI" uses selected tools for prompt context

---

## Verification

1. Drop an MCP server on the canvas
2. Verify tools are fetched and displayed
3. Select specific tools
4. Click "Generate with AI" and verify selected tools are used
