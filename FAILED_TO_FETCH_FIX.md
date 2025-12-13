# Fix for "Failed to fetch" Error

## Root Cause
Next.js caches environment variables when the dev server starts. Your `.env.local` file has the correct `NEXT_PUBLIC_API_URL`, but the running server has the old cached value.

## Solution

### Step 1: Stop the Frontend Dev Server
In your terminal running `npm run dev`, press `Ctrl+C` to stop it.

### Step 2: Verify .env.local
Make sure `frontend/.env.local` contains:
```
NEXT_PUBLIC_API_URL=http://127.0.0.1:8000/api/v1
```

### Step 3: Restart Frontend Server
```bash
cd frontend
npm run dev
```

### Step 4: Check Browser Console
After restarting, click on the "MCP Servers" tab and check the browser console. You should see:
```
API_URL: http://127.0.0.1:8000/api/v1
Fetching from: http://127.0.0.1:8000/api/v1/mcp-servers
```

If you still see `http://127.0.0.1:8000/mcp-servers` (without `/api/v1`), then:
1. Make sure `.env.local` exists in the `frontend` folder
2. Try deleting `.next` folder: `rm -r .next`
3. Restart dev server again

## Alternative: Hard-code for Testing
If the env variable still doesn't work, you can temporarily hard-code it in `frontend/src/lib/utils.ts`:
```typescript
export const API_URL = "http://127.0.0.1:8000/api/v1"
```

## Verification
Once fixed, all three API calls should succeed:
- ✅ GET /api/v1/mcp-servers
- ✅ GET /api/v1/users  
- ✅ GET /api/v1/ad-groups
