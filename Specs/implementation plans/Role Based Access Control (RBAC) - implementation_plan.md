# Implementation Plan - Role Based Access Control (RBAC)

## Goal Description
Implement a flexible Role-Based Access Control (RBAC) system where "Features" (Permissions) can be allocated to Roles. Users assigned to these roles will inherit the permissions. This includes backend support for storing and checking permissions, and frontend UI for managing them.

## User Review Required
> [!IMPORTANT]
> I will define a set of initial permissions (Features) based on the current application capabilities.
> **Proposed Permissions:**
> - `MANAGE_USERS`: Access to User Management.
> - `MANAGE_ROLES`: Access to Role Management.
> - `MANAGE_AGENTS`: Ability to create/edit agents.
> - `VIEW_ANALYTICS`: Access to analytics/logs.
> - `CHAT`: Basic access to chat.
>
> Please let me know if you want to change or add to this list.

## Proposed Changes

### Backend

#### [MODIFY] [user.py](file:///c:/Users/opole/Downloads/ChatBotn/backend/app/models/user.py)
- Update `Role` model to handle `permissions` as a JSON list.
- Define `Permission` Enum.

#### [MODIFY] [schemas/user.py](file:///c:/Users/opole/Downloads/ChatBotn/backend/app/schemas/user.py)
- Update `RoleCreate`, `RoleUpdate`, and `Role` schemas to include `permissions: List[str]`.

#### [MODIFY] [routers/roles.py](file:///c:/Users/opole/Downloads/ChatBotn/backend/app/routers/roles.py)
- Update `create_role` and `update_role` to handle permissions.
- Add endpoint to get available permissions (optional, or hardcode in FE).

#### [NEW] [core/security.py](file:///c:/Users/opole/Downloads/ChatBotn/backend/app/core/security.py) (or update auth.py)
- Add dependency `require_permission(permission: str)`.

### Frontend

#### [MODIFY] [components/settings/roles-tab.tsx](file:///c:/Users/opole/Downloads/ChatBotn/frontend/src/components/settings/roles-tab.tsx)
- Update "Create Role" and "Edit Role" dialogs to include a list of checkboxes for permissions.
- Display permissions in the Roles table.

#### [NEW] [lib/permissions.ts](file:///c:/Users/opole/Downloads/ChatBotn/frontend/src/lib/permissions.ts)
- Define available permissions constants to match backend.

#### [MODIFY] [app/settings/users/page.tsx](file:///c:/Users/opole/Downloads/ChatBotn/frontend/src/app/settings/users/page.tsx)
- Ensure Role management is protected or only visible to Admins (which it likely is, but we'll enforce it).

## Verification Plan

### Manual Verification
1.  **Role Creation**:
    - Go to Settings > Roles.
    - Create a new role "Agent Creator" with `MANAGE_AGENTS` permission only.
    - Verify it appears in the list with correct permissions.
2.  **Role Assignment**:
    - Go to Settings > Users.
    - Create/Edit a user and assign "Agent Creator" role.
3.  **Access Control**:
    - Login as the new user.
    - Verify they can access Agent creation features.
    - Verify they CANNOT access User Management (should be hidden or denied).
