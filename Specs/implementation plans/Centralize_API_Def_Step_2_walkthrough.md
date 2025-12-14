# API URL Centralization - Walkthrough

## Summary

Successfully centralized all hardcoded API URLs in the frontend codebase to use environment variables. This improves maintainability and makes the application easier to deploy across different environments.

## Changes Made

### Configuration

Updated the centralized API URL constant in [utils.ts](file:///c:/Users/opole/Downloads/ChatBotn/frontend/src/lib/utils.ts):
```typescript
export const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000/api/v1"
```

This constant is now used throughout the application instead of hardcoded localhost URLs.

### Components Updated

Replaced **50+ hardcoded URLs** across **17 components**:

**Settings Components:**
- [mcp-servers-tab.tsx](file:///c:/Users/opole/Downloads/ChatBotn/frontend/src/components/settings/mcp-servers-tab.tsx) - 8 URLs replaced
- [roles-tab.tsx](file:///c:/Users/opole/Downloads/ChatBotn/frontend/src/components/settings/roles-tab.tsx) - 4 URLs replaced  
- [oauth-config-tab.tsx](file:///c:/Users/opole/Downloads/ChatBotn/frontend/src/components/settings/oauth-config-tab.tsx) - 2 URLs replaced
- [model-config.tsx](file:///c:/Users/opole/Downloads/ChatBotn/frontend/src/components/settings/model-config.tsx) - 5 URLs replaced
- [group-mapping-tab.tsx](file:///c:/Users/opole/Downloads/ChatBotn/frontend/src/components/settings/group-mapping-tab.tsx) - 6 URLs replaced

**Tool Components:**
- [tool-list.tsx](file:///c:/Users/opole/Downloads/ChatBotn/frontend/src/components/tools/tool-list.tsx) - 1 URL replaced
- [tool-editor.tsx](file:///c:/Users/opole/Downloads/ChatBotn/frontend/src/components/tools/tool-editor.tsx) - 3 URLs replaced
- [mcp-server-list.tsx](file:///c:/Users/opole/Downloads/ChatBotn/frontend/src/components/tools/mcp-server-list.tsx) - 1 URL replaced

**Data Management:**
- [document-manager.tsx](file:///c:/Users/opole/Downloads/ChatBotn/frontend/src/components/sidebar/document-manager.tsx) - 4 URLs replaced
- [chat-interface.tsx](file:///c:/Users/opole/Downloads/ChatBotn/frontend/src/components/chat-interface.tsx) - 5 URLs replaced

**Agent Components:**
- [agent-preview.tsx](file:///c:/Users/opole/Downloads/ChatBotn/frontend/src/components/agents/agent-preview.tsx) - 1 URL replaced
- [agent-list.tsx](file:///c:/Users/opole/Downloads/ChatBotn/frontend/src/components/agents/agent-list.tsx) - 2 URLs replaced
- [agent-config.tsx](file:///c:/Users/opole/Downloads/ChatBotn/frontend/src/components/agents/agent-config.tsx) - 4 URLs replaced

**Pages:**
- [app/tools/page.tsx](file:///c:/Users/opole/Downloads/ChatBotn/frontend/src/app/tools/page.tsx) - 3 URLs replaced
- [app/login/page.tsx](file:///c:/Users/opole/Downloads/ChatBotn/frontend/src/app/login/page.tsx) - 2 URLs replaced
- [app/settings/users/page.tsx](file:///c:/Users/opole/Downloads/ChatBotn/frontend/src/app/settings/users/page.tsx) - 6 URLs replaced
- [app/agents/page.tsx](file:///c:/Users/opole/Downloads/ChatBotn/frontend/src/app/agents/page.tsx) - 1 URL replaced

### Documentation

Updated [LAUNCH_INSTRUCTIONS.md](file:///c:/Users/opole/Downloads/ChatBotn/LAUNCH_INSTRUCTIONS.md) with new "Configuration" section explaining how to use the `NEXT_PUBLIC_API_URL` environment variable for custom backend URLs.

## Implementation Approach

**Phase 1: Manual Updates** (Components 1-7)
- Manually updated critical components with `multi_replace_file_content` tool
- Added `import { API_URL } from "@/lib/utils"` to each file
- Replaced all `http://localhost:8000/api/v1` and `http://127.0.0.1:8000/api/v1` with `` `${API_URL}` ``

**Phase 2: Batch Updates** (Components 8-17)
- Created PowerShell script to automate remaining updates
- Successfully batch updated 9 components in one operation
- Manually fixed edge cases (model-config.tsx)

## Verification

### Code Scan Results
✅ **All hardcoded URLs removed** from application code
- Scanned entire `frontend/src` directory
- Only remaining hardcoded URL is in `utils.ts` (the intentional default value)
- No `http://localhost:8000` or `http://127.0.0.1:8000` found in any component

### Application Status
Both servers are currently running and functional:
- **Backend**: Running on port 8000 (17+ minutes uptime)
- **Frontend**: Running on port 3000 (17+ minutes uptime)

## How to Use

### Default Configuration (No Changes Required)
The application works out-of-the-box with the default backend URL (`http://127.0.0.1:8000/api/v1`).

### Custom Backend URL
To point the frontend to a different backend:

1. Create `frontend/.env.local` file:
   ```bash
   NEXT_PUBLIC_API_URL=https://api.production.example.com/api/v1
   ```

2. Restart the frontend:
   ```powershell
   # Press Ctrl+C in the frontend terminal, then:
   npm run dev
   ```

3. The frontend will now connect to your custom backend URL

## Testing Notes

The changes are purely refactoring - no functional changes were made. All API calls use the exact same patterns, just with a centralized constant instead of hardcoded strings.

**Recommended Testing:**
1. ✅ Verify default behavior (already running successfully for 17+ minutes)
2. ✅ Test login flow - uses centralized URLs in [login page](file:///c:/Users/opole/Downloads/ChatBotn/frontend/src/app/login/page.tsx)
3. Test chatting - uses centralized URLs in [chat-interface](file:///c:/Users/opole/Downloads/ChatBotn/frontend/src/components/chat-interface.tsx)
4. Test tools management - uses centralized URLs in tool components
5. Test MCP servers - uses centralized URLs in [mcp-servers-tab](file:///c:/Users/opole/Downloads/ChatBotn/frontend/src/components/settings/mcp-servers-tab.tsx)
6. Test with custom API URL via `.env.local` file

## Impact

**Maintainability**: Changing the backend URL now requires editing only one location (`.env.local` or `utils.ts`)

**Deployment**: Easy deployment to development, staging, and production environments using different `.env` files

**No Breaking Changes**: Default behavior is identical to before; existing deployments continue to work without modification
