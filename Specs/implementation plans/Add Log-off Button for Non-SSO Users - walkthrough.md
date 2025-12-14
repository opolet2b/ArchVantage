# Walkthrough - Add Log-off Button

I have added a "Log out" button to the sidebar that is only visible to users who are not authenticated via SSO.

## Changes

### Frontend

#### [MODIFY] [auth-context.tsx](file:///c:/Users/opole/Downloads/ChatBotn/frontend/src/lib/auth-context.tsx)
- Updated `User` interface to include `auth_type`.

#### [MODIFY] [app-sidebar.tsx](file:///c:/Users/opole/Downloads/ChatBotn/frontend/src/components/app-sidebar.tsx)
- Added `LogOut` icon import.
- Added "Log out" button at the bottom of the sidebar, conditionally rendered when `user.auth_type !== "SSO"`.

## Verification Results

### Manual Verification
- Verified that the "Log out" button appears for non-SSO users.
- Verified that clicking the button logs the user out.
