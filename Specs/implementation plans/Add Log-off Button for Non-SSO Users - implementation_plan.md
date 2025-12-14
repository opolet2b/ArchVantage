# Add Log-off Button for Non-SSO Users

The user wants a log-off button specifically for users who are not authenticated via SSO (i.e., Internal users).

## Proposed Changes

### Frontend

#### [MODIFY] [Auth Context](file:///c:/Users/opole/Downloads/ChatBotn/frontend/src/lib/auth-context.tsx)
- Ensure `logout` function is available and clears tokens/state.
- Ensure `user` object has `auth_type` or similar property to distinguish SSO vs Internal.

#### [MODIFY] [Sidebar Component](file:///c:/Users/opole/Downloads/ChatBotn/frontend/src/components/app-sidebar.tsx)
- Add a "Log out" button at the bottom of the sidebar.
- Conditionally render this button only if `user.auth_type !== 'SSO'` (or equivalent check).

## Verification Plan

### Manual Verification
- Log in as an Internal user -> Verify "Log out" button appears and works.
- Log in as an SSO user (if possible to simulate) -> Verify "Log out" button does NOT appear.
