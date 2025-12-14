# Centralize Frontend API URL Configuration

This implementation plan addresses the request to remove all hardcoded `http://localhost:8000` and `http://127.0.0.1:8000` URLs throughout the frontend codebase and centralize them using environment variables.

## Background

Currently, the codebase has:
- **50+ hardcoded API URLs** scattered across 17+ component files
- An existing `API_URL` constant in [utils.ts](file:///c:/Users/opole/Downloads/ChatBotn/frontend/src/lib/utils.ts) that is **not being consistently used**
- Two variations: `http://localhost:8000` (46 occurrences) and `http://127.0.0.1:8000` (8 occurrences)

The existing `API_URL` constant already supports environment variables:
```typescript
export const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000/api/v1"
```

This change will make the application more maintainable and easier to deploy to different environments (development, staging, production).

## User Review Required

> [!IMPORTANT]
> **No breaking changes** - The default behavior remains unchanged (localhost:8000). This is purely a refactoring to improve code quality and configurability.

## Proposed Changes

### Frontend Configuration

#### [NEW] [.env.local.example](file:///c:/Users/opole/Downloads/ChatBotn/frontend/.env.local.example)
Create an example environment file to document the configuration option:
```env
# Backend API URL (default: http://127.0.0.1:8000/api/v1)
# Uncomment and modify to point to a different backend
# NEXT_PUBLIC_API_URL=http://your-backend-url.com/api/v1
```

---

### Component Updates

All components will be updated to:
1. Import the `API_URL` constant from `@/lib/utils`
2. Replace hardcoded URLs with the `API_URL` constant
3. Maintain exact same functionality

#### [MODIFY] [mcp-servers-tab.tsx](file:///c:/Users/opole/Downloads/ChatBotn/frontend/src/components/settings/mcp-servers-tab.tsx)
- Replace 8 hardcoded URLs in `fetchData()`, `handleSave()`, `handleDelete()`, and `handleTestConnection()`
- Example: `"http://127.0.0.1:8000/api/v1/mcp-servers"` → `` `${API_URL}/mcp-servers` ``

#### [MODIFY] [tool-list.tsx](file:///c:/Users/opole/Downloads/ChatBotn/frontend/src/components/tools/tool-list.tsx)
- Replace 1 hardcoded URL in tool fetching

#### [MODIFY] [tool-editor.tsx](file:///c:/Users/opole/Downloads/ChatBotn/frontend/src/components/tools/tool-editor.tsx)
- Replace 3 hardcoded URLs for users, ad-groups, and prompt generation

#### [MODIFY] [mcp-server-list.tsx](file:///c:/Users/opole/Downloads/ChatBotn/frontend/src/components/tools/mcp-server-list.tsx)
- Replace 1 hardcoded URL for MCP server fetching

#### [MODIFY] [document-manager.tsx](file:///c:/Users/opole/Downloads/ChatBotn/frontend/src/components/sidebar/document-manager.tsx)
- Replace 4 hardcoded URLs for document operations (list, download, delete, upload)

#### [MODIFY] [roles-tab.tsx](file:///c:/Users/opole/Downloads/ChatBotn/frontend/src/components/settings/roles-tab.tsx)
- Replace 4 hardcoded URLs for role CRUD operations

#### [MODIFY] [oauth-config-tab.tsx](file:///c:/Users/opole/Downloads/ChatBotn/frontend/src/components/settings/oauth-config-tab.tsx)
- Replace 2 hardcoded URLs for OAuth configuration

#### [MODIFY] [model-config.tsx](file:///c:/Users/opole/Downloads/ChatBotn/frontend/src/components/settings/model-config.tsx)
- Replace 5 hardcoded URLs for model and preset configuration

#### [MODIFY] [group-mapping-tab.tsx](file:///c:/Users/opole/Downloads/ChatBotn/frontend/src/components/settings/group-mapping-tab.tsx)
- Replace 6 hardcoded URLs for group mapping operations

#### [MODIFY] [chat-interface.tsx](file:///c:/Users/opole/Downloads/ChatBotn/frontend/src/components/chat-interface.tsx)
- Replace 5 hardcoded URLs for chat and message operations

#### [MODIFY] [agent-preview.tsx](file:///c:/Users/opole/Downloads/ChatBotn/frontend/src/components/agents/agent-preview.tsx)
- Replace 1 hardcoded URL for agent preview

#### [MODIFY] [agent-list.tsx](file:///c:/Users/opole/Downloads/ChatBotn/frontend/src/components/agents/agent-list.tsx)
- Replace 2 hardcoded URLs for agent deletion and renaming

#### [MODIFY] [agent-config.tsx](file:///c:/Users/opole/Downloads/ChatBotn/frontend/src/components/agents/agent-config.tsx)
- Replace 4 hardcoded URLs for agent configuration and file operations

#### [MODIFY] [app/tools/page.tsx](file:///c:/Users/opole/Downloads/ChatBotn/frontend/src/app/tools/page.tsx)
- Replace 3 hardcoded URLs for tool operations

#### [MODIFY] [app/login/page.tsx](file:///c:/Users/opole/Downloads/ChatBotn/frontend/src/app/login/page.tsx)
- Replace 2 hardcoded URLs for authentication

#### [MODIFY] [app/settings/users/page.tsx](file:///c:/Users/opole/Downloads/ChatBotn/frontend/src/app/settings/users/page.tsx)
- Replace 6+ hardcoded URLs for user management operations

---

### Documentation

#### [MODIFY] [LAUNCH_INSTRUCTIONS.md](file:///c:/Users/opole/Downloads/ChatBotn/LAUNCH_INSTRUCTIONS.md)
Add section explaining environment variable configuration:
```markdown
## Configuration (Optional)

To configure the backend API URL:
1. Create a `.env.local` file in the `frontend` directory
2. Add: `NEXT_PUBLIC_API_URL=http://your-backend-url/api/v1`
3. Restart the frontend server

See `.env.local.example` for more details.
```

## Verification Plan

### Automated Tests
Since this is a refactoring that doesn't change functionality, automated tests would require checking that all API calls still work. Given the scope, manual verification is more appropriate.

### Manual Verification

**Test 1: Default Configuration (Current Behavior)**
1. Ensure no `.env.local` file exists in `frontend/` directory
2. Start backend: `cd backend && ..\.venv\Scripts\Activate.ps1 && uvicorn main:app --reload`
3. Start frontend: `cd frontend && npm run dev`
4. Open browser to http://localhost:3000
5. Login with credentials
6. Verify the following features work:
   - Chat interface sends/receives messages
   - Tools page loads and displays tools
   - MCP Servers tab loads server list
   - User Management page loads users
   - Settings pages load correctly
7. Open browser DevTools Console and verify no fetch errors

**Test 2: Custom API URL via Environment Variable**
1. Create `frontend/.env.local` with:
   ```
   NEXT_PUBLIC_API_URL=http://127.0.0.1:8000/api/v1
   ```
2. Restart frontend server
3. Repeat steps 4-7 from Test 1
4. Verify all API calls go to the configured URL (check Network tab in DevTools)

**Test 3: Code Review**
1. Search codebase for remaining hardcoded URLs:
   ```powershell
   cd frontend/src
   findstr /s /i "http://localhost:8000" *.tsx *.ts
   findstr /s /i "http://127.0.0.1:8000" *.tsx *.ts
   ```
2. Verify no results are returned (all URLs centralized)
