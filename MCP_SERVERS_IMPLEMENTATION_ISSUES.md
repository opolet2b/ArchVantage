# MCP Servers Implementation Issues & Fixes

## Issues Found vs Implementation Plan

### ❌ Issue 1: Duplicate Router Registration (FIXED)
**Problem:**
- In `backend/main.py`, both `tools.router` and `mcp_servers.router` were registered
- Both had MCP server endpoints at `/api/v1/mcp-servers`
- This created endpoint conflicts

**Expected (from plan):**
- MCP server endpoints should be in `tools.router` only

**Fix Applied:**
- Removed `mcp_servers` import from `main.py`
- Removed duplicate router registration line
- Now only `tools.router` handles MCP server endpoints

---

### ❌ Issue 2: Missing `/api/v1/ad-groups` Endpoint (FIXED)
**Problem:**
- Frontend tries to fetch AD groups from `${API_URL}/ad-groups`
- This endpoint didn't exist in the backend
- Caused "Failed to fetch" error on line 74 of `mcp-servers-tab.tsx`

**Expected (from plan):**
- Need to be able to fetch AD groups for permission assignment

**Fix Applied:**
- Added `/api/v1/ad-groups` endpoint to `users.router`
- Imports `KnownADGroup` model
- Returns list of all AD groups with id, display_name, etc.
- Admin-only access required

---

### ⚠️ Issue 3: Authentication Inconsistency (PARTIALLY ADDRESSED)
**Problem:**
- The `mcp_servers.router` uses `get_current_user` (any authenticated user)
- The `tools.router` correctly uses `get_current_admin_user` for create/update/delete

**Expected (from plan):**
> Add permission checks for create/update/delete (admin-only)

**Current Status:**
- `tools.router` MCP endpoints: ✅ Admin-only for create/update/delete
- `mcp_servers.router`: ⚠️ Not being used anymore (removed from main.py)

**Resolution:**
Since we removed the duplicate `mcp_servers.router`, the correct `tools.router` implementation is now in effect.

---

### ⚠️ Issue 4: Permission Filtering Implementation
**Problem:**
The implementation plan specified:
```
GET /mcp-servers - Add optional for_tool_builder query param to filter by user access
```

**Current Status:**
- ✅ `tools.router` has `for_tool_builder` parameter (line 118)
- ✅ Filters by user when `for_tool_builder=true` and user is not admin
- ✅ Calls `get_mcp_servers_for_user()`

This is **correctly implemented** in `tools.router`.

---

## Frontend Implementation Review

### ✅ `mcp-servers-tab.tsx` - CORRECT
The frontend implementation matches the plan:
- Fetches from `/api/v1/mcp-servers` ✅
- Fetches from `/api/v1/users` ✅
- Fetches from `/api/v1/ad-groups` ✅ (now available)
- Has auth fields (auth_type, auth_config) ✅
- Has permission assignment UI ✅
- Shows user/group selectors ✅

---

## Remaining Considerations

### 1. **Data Model Verification**
Need to ensure:
- ✅ `MCPServer` model has `auth_type` field
- ✅ `MCPServer` model has `auth_config` JSON field
- ✅ `MCPServerPermission` model exists
- ✅ Relationship between models is correct

### 2. **Service Layer Functions**
According to the plan, these should exist:
- `get_mcp_servers_for_user(user_id)` - ✅ Referenced in tools.router
- CRUD operations - ✅ Referenced in tools.router

### 3. **Security Consideration**
From the implementation plan:
> **IMPORTANT:** Authentication credentials will be stored in the database. For production, these should be encrypted at rest.

**Current Status:** ⚠️ Auth credentials stored in plaintext in `auth_config` JSON field
**Recommendation:** Add encryption before production use

---

## Testing Checklist

### Backend Endpoints
- [ ] GET `/api/v1/mcp-servers` returns list of servers
- [ ] GET `/api/v1/mcp-servers?for_tool_builder=true` filters by user access
- [ ] POST `/api/v1/mcp-servers` creates server (admin only)
- [ ] PUT `/api/v1/mcp-servers/{id}` updates server (admin only)
- [ ] DELETE `/api/v1/mcp-servers/{id}` deletes server (admin only)
- [ ] GET `/api/v1/users` returns users list
- [ ] GET `/api/v1/ad-groups` returns AD groups list
- [ ] POST `/api/v1/mcp-servers/{id}/discover` discovers tools

### Frontend UI
- [ ] MCP Servers tab appears in Settings (admin only)
- [ ] Can create new MCP server
- [ ] Can select auth type (NONE, API_KEY, OAUTH2)
- [ ] Auth fields appear based on auth type selection
- [ ] Can assign user permissions
- [ ] Can assign group permissions
- [ ] Can edit existing servers
- [ ] Can delete servers
- [ ] Test Connection button works

---

## Summary

### Issues Fixed ✅
1. Removed duplicate router registration
2. Added missing `/api/v1/ad-groups` endpoint

### Why "Failed to fetch" Error Occurred
The error on line 68 (`fetch(\`${API_URL}/mcp-servers\`)`) was likely caused by:
1. **Router conflict** - Duplicate registration might have caused routing issues
2. **Missing AD groups endpoint** - Line 74 definitely failed
3. **Backend not running** - Need to verify backend is running on correct port

### Next Steps
1. ✅ Apply fixes (DONE)
2. ⏳ Restart backend server
3. ⏳ Test all endpoints with proper authentication
4. ⏳ Verify UI functionality
5. ⏳ Consider adding auth_config encryption for production
