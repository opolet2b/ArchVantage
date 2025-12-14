# User Management UI & Auth Fix Walkthrough

I have fixed the issue where the "User Management" link was missing, resolved a client-side component error, and fixed authentication persistence and fetch errors.

## Changes

### 1. App Sidebar (`frontend/src/components/app-sidebar.tsx`)
- Added a "User Management" link to the sidebar.
- The link is **only visible to users with the "Admin" role**.
- The link points to `/settings?tab=users` to maintain the Settings page layout.

### 2. Settings Page (`frontend/src/app/settings/page.tsx`)
- Added `"use client"` directive to fix React hook error.
- Updated the page to read the `tab` query parameter from the URL.
- This allows deep linking to the "User Management" tab (e.g. `/settings?tab=users`).

### 3. Authentication & Data Fetching
- **Auth Context (`frontend/src/lib/auth-context.tsx`)**: Updated to validate the token with the backend on page load. If the token is invalid or expired, the user is automatically logged out.
- **Conversation Context (`frontend/src/lib/conversation-context.tsx`)**: Added `Authorization` header to all API requests to fix "Failed to fetch" errors.

## Verification

### Manual Verification Steps
1. **Login as Admin**: Ensure you are logged in with an account that has the "Admin" role (e.g., `admin@example.com`).
2. **Check Sidebar**: You should see a "User Management" link in the left sidebar, below "Settings".
3. **Click Link**: Clicking the link should take you to the Settings page with the "User Management" tab active.
4. **Refresh Page**: Refresh the page. You should stay logged in, and the "User Management" link should still be visible (if you are Admin).
5. **Check Console**: The "Failed to fetch" errors for conversations should be gone.

## Technical Details
- Used `useAuth` hook to check for `user.roles.includes("Admin")`.
- Used `useSearchParams` to handle URL query parameters for tab state.
- Added `"use client"` to `SettingsPage`.
- Implemented token validation on mount in `AuthProvider`.
- Added Bearer token to `fetch` calls in `ConversationProvider`.
