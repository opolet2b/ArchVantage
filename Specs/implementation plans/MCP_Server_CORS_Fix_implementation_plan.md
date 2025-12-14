# Implementation Plan - Fix CORS and Fetch Errors

## Goal
Resolve the "Access to fetch at '...' from origin '...' has been blocked by CORS policy" error when accessing the MCP Servers tab.

## Proposed Changes

### Backend
#### [CHECK] [config.py](file:///c:/Users/opole/Downloads/ChatBotn/backend/app/core/config.py)
- Verify how `BACKEND_CORS_ORIGINS` is parsed. It needs to handle the comma-separated string correctly from the `.env` file.
- If it expects a list but gets a string, that would be the issue.

### Frontend
#### [MODIFY] [.env.local](file:///c:/Users/opole/Downloads/ChatBotn/frontend/.env.local)
- Change `NEXT_PUBLIC_API_URL` to `http://localhost:8000/api/v1` to match the likely browser origin (if the user is visiting `localhost:3000`).
- Alternatively, ensure it matches what the backend expects.

## Verification Plan
### Manual Verification
- Restart Backend and Frontend servers.
- Open `http://localhost:3000/settings?tab=mcp-servers`.
- Check browser console for successful fetch requests.
