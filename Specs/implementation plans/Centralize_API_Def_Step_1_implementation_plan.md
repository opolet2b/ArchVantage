# Refactoring Frontend API URL

## Goal
Centralize the API URL configuration in the frontend to avoid hardcoded `localhost:8000` or `127.0.0.1:8000` strings. This will make the application more robust and easier to configure for different environments.

## Proposed Changes

### Configuration
#### [NEW] [frontend/.env.local](file:///c:/Users/opole/Downloads/ChatBotn/frontend/.env.local)
- Add `NEXT_PUBLIC_API_URL=http://127.0.0.1:8000/api/v1`

#### [MODIFY] [frontend/src/lib/utils.ts](file:///c:/Users/opole/Downloads/ChatBotn/frontend/src/lib/utils.ts)
- Export `API_URL` constant using `process.env.NEXT_PUBLIC_API_URL` with a fallback.

### Component Refactoring
Replace all hardcoded `http://localhost:8000/api/v1` and `http://127.0.0.1:8000/api/v1` with `API_URL` imported from `@/lib/utils`.

#### Components
- `src/lib/conversation-context.tsx`
- `src/lib/auth-context.tsx`
- `src/components/tools/tool-list.tsx`
- `src/components/tools/tool-editor.tsx`
- `src/components/tools/mcp-server-list.tsx`
- `src/components/sidebar/document-manager.tsx`
- `src/components/settings/roles-tab.tsx`
- `src/components/settings/oauth-config-tab.tsx`
- `src/components/settings/model-config.tsx`
- `src/components/settings/mcp-servers-tab.tsx`
- `src/components/settings/group-mapping-tab.tsx`
- `src/components/chat-interface.tsx`
- `src/components/agents/agent-preview.tsx`
- `src/components/agents/agent-list.tsx`
- `src/components/agents/agent-config.tsx`

#### Pages
- `src/app/tools/page.tsx`
- `src/app/settings/users/page.tsx`
- `src/app/login/page.tsx`
- `src/app/agents/page.tsx`

## Verification Plan
### Manual Verification
1. Restart frontend server to load environment variables.
2. Navigate through the application (Login, Chat, Settings, Tools, Agents).
3. Verify that data loads correctly and no "Failed to fetch" errors occur.
