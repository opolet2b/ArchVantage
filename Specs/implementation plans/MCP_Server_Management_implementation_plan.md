# Implementation Plan: MCP Server Management in Settings

## Goal
Add an admin-only "MCP Servers" tab to Settings for configuring MCP servers with authentication and user/group-based access control.

---

## Proposed Changes

### Backend

#### [MODIFY] [models/tools.py](file:///c:/Users/opole/Downloads/ChatBotn/backend/app/models/tools.py)
Enhance `MCPServer` model:
- Add `auth_type` field (NONE, OAUTH2, API_KEY)
- Add `auth_config` JSON field for storing auth credentials
- Add relationship to `MCPServerPermission` model

Add new `MCPServerPermission` model:
- `mcp_server_id` (FK to mcp_servers)
- `user_id` (nullable FK to users)
- `ad_group_id` (nullable FK to known_ad_groups)

#### [MODIFY] [schemas/tools.py](file:///c:/Users/opole/Downloads/ChatBotn/backend/app/schemas/tools.py)
Add schemas:
- `AuthType` enum
- `MCPServerPermissionCreate`
- `MCPServerPermission`
- Update `MCPServerCreate` and `MCPServerUpdate` to include auth fields and permissions

#### [MODIFY] [services/tools.py](file:///c:/Users/opole/Downloads/ChatBotn/backend/app/services/tools.py)
Add functions:
- `get_mcp_servers_for_user(user_id)` - Filter servers by permissions
- Update CRUD to handle permissions

#### [MODIFY] [routers/tools.py](file:///c:/Users/opole/Downloads/ChatBotn/backend/app/routers/tools.py)
Update endpoints:
- `GET /mcp-servers` - Add optional `for_tool_builder` query param to filter by user access
- Add permission checks for create/update/delete (admin-only)

---

### Frontend

#### [NEW] [components/settings/mcp-servers-tab.tsx](file:///c:/Users/opole/Downloads/ChatBotn/frontend/src/components/settings/mcp-servers-tab.tsx)
Create MCP Server management component:
- List view with server cards
- Edit dialog with:
  - Name, URL, Description fields
  - Auth type selector (None, OAuth 2.0, API Key)
  - Conditional auth fields
  - User/Group permission assignment
- Admin-only access

#### [MODIFY] [app/settings/page.tsx](file:///c:/Users/opole/Downloads/ChatBotn/frontend/src/app/settings/page.tsx)
- Add "MCP Servers" tab
- Import and render `MCPServersTab`

#### [MODIFY] [components/tools/mcp-server-list.tsx](file:///c:/Users/opole/Downloads/ChatBotn/frontend/src/components/tools/mcp-server-list.tsx)
- Update fetch to use `?for_tool_builder=true` to filter by user permissions

---

## Implementation Order

### Phase 1: Backend Models & Schemas
1. Update `MCPServer` model with auth fields
2. Create `MCPServerPermission` model
3. Create corresponding Pydantic schemas

### Phase 2: Backend Services & Routes
4. Update MCP server CRUD to handle permissions
5. Add user-filtered endpoint
6. Add admin-only middleware checks

### Phase 3: Frontend Settings Tab
7. Create `mcp-servers-tab.tsx` component
8. Add to Settings page
9. Implement add/edit/delete functionality

### Phase 4: Tool Builder Integration
10. Update `mcp-server-list.tsx` to filter by permissions
11. Test access control

---

## Verification Plan

1. **Admin can manage servers**:
   - Log in as admin
   - Navigate to Settings > MCP Servers
   - Create a server with OAuth 2.0 auth
   - Assign user/group permissions
   
2. **Non-admin cannot access**:
   - Log in as regular user
   - Verify "MCP Servers" tab is not visible

3. **Tool Builder respects permissions**:
   - Log in as user with access
   - Verify server appears in Tool Builder
   - Log in as user without access
   - Verify server does NOT appear

---

## Notes

> [!IMPORTANT]
> Authentication credentials will be stored in the database. For production, these should be encrypted at rest.

> [!NOTE]
> The `auth_config` JSON field structure:
> - For `NONE`: `{}`
> - For `API_KEY`: `{ "api_key": "..." }`
> - For `OAUTH2`: `{ "client_id": "...", "client_secret": "...", "token_url": "..." }`
