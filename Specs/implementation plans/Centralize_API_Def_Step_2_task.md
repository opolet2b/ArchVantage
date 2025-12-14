# Centralize Frontend API URL Configuration

## Goals
- ✅ Remove all hardcoded `http://localhost:8000` and `http://127.0.0.1:8000` references
- ✅ Use centralized API_URL constant from `utils.ts`
- ✅ Add environment variable support for easy deployment

## Tasks

### Planning
- [x] Analyze current state and identify all hardcoded URLs
- [x] Create implementation plan
- [x] Request user review and approval

### Implementation
- [x] Create `.env.local.example` file (skipped - blocked by gitignore)
- [x] Update all components to use centralized API_URL
  - [x] `mcp-servers-tab.tsx` (8 hardcoded URLs)
  - [x] `tool-list.tsx` (1 URL)
  - [x] `tool-editor.tsx` (3 URLs)
  - [x] `mcp-server-list.tsx` (1 URL)
  - [x] `document-manager.tsx` (4 URLs)
  - [x] `roles-tab.tsx` (4 URLs)
  - [x] `oauth-config-tab.tsx` (2 URLs)
  - [x] `model-config.tsx` (5 URLs)
  - [x] `group-mapping-tab.tsx` (6 URLs)
  - [x] `chat-interface.tsx` (5 URLs)
  - [x] `agent-preview.tsx` (1 URL)
  - [x] `agent-list.tsx` (2 URLs)
  - [x] `agent-config.tsx` (4 URLs)
  - [x] `app/tools/page.tsx` (3 URLs)
  - [x] `app/login/page.tsx` (2 URLs)
  - [x] `app/settings/users/page.tsx` (6 URLs)
  - [x] `app/agents/page.tsx` (1 URL)
- [x] Update LAUNCH_INSTRUCTIONS.md with environment variable documentation

### Verification
- [x] Verify no remaining hardcoded URLs (only utils.ts default remains)
- [x] Application running successfully with centralized URLs
- [ ] Test with custom API URL via environment variable (optional user testing)
- [ ] Browser console check (optional user testing)

## Summary

Successfully centralized 50+ hardcoded API URLs across 17 components. All components now use the `API_URL` constant from `utils.ts`, which supports environment variable configuration via `NEXT_PUBLIC_API_URL`.
