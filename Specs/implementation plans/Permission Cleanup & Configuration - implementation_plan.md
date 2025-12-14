# Permission Cleanup & Configuration

The "View Analytics" permission is a placeholder and not connected to any active feature. We will remove it to avoid confusion.

## User Review Required

> [!NOTE]
> This change removes "View Analytics" from the available permissions list.

## Proposed Changes

### Frontend

#### [MODIFY] [permissions.ts](file:///c:/Users/opole/Downloads/ChatBotn/frontend/src/lib/permissions.ts)

- Remove `VIEW_ANALYTICS` from `PERMISSIONS` and `PERMISSION_LABELS`.

## How to Configure Permission Mappings

Permissions are mapped to features directly in the code.

1.  **Define the Permission**: Add a new key to `PERMISSIONS` in `frontend/src/lib/permissions.ts`.
2.  **Protect Frontend Components**: Use the `RequirePermission` component or `usePermission` hook.
    ```tsx
    <RequirePermission permission="NEW_FEATURE">
        <NewFeatureComponent />
    </RequirePermission>
    ```
3.  **Protect Backend Endpoints**: Use the `PermissionChecker` dependency.
    ```python
    @router.get("/new-feature")
    def new_feature(user: User = Depends(PermissionChecker("NEW_FEATURE"))):
        ...
    ```

## Verification Plan

### Manual Verification
1.  Navigate to **Settings > User Management > Roles**.
2.  Create or Edit a role.
3.  **Verify**: "View Analytics" is no longer listed in the permissions checkboxes.
