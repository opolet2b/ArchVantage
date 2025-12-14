# User Management Enhancement Plan

This plan enhances the existing User Management system with editing capabilities, role management UI, AD group mapping, and filtering features.

## Current State

### Backend ✅
- Database models: `User`, `Role`, `UserRole`, `KnownADGroup`, `GroupMapping`
- User CRUD endpoints: create, list, toggle active
- Role endpoints: create, list, delete
- Basic authentication with JWT tokens
- Default admin user (admin@example.com / admin123)

### Frontend ✅
- User Management page with table view
- Create user dialog
- Toggle user active/inactive
- Display roles as badges

## Proposed Changes

### Backend Enhancements

#### [MODIFY] [users.py](file:///c:/Users/opole/Downloads/ChatBotn/backend/app/routers/users.py)
- Add endpoint to get user details with role source information (MANUAL vs MAPPED)
- Enhance update endpoint to handle role updates properly
- Add filtering parameters: `auth_type`, `has_no_roles`

#### [MODIFY] [roles.py](file:///c:/Users/opole/Downloads/ChatBotn/backend/app/routers/roles.py)
- Add endpoint to update role details
- Implement proper role deletion cascade (reassign users to "User" role)
- Add endpoint to get group mappings for a specific role
- Add endpoint to delete group mappings
- Add endpoint to manually add AD groups

#### [NEW] [oauth.py](file:///c:/Users/opole/Downloads/ChatBotn/backend/app/routers/oauth.py)
- OAuth configuration endpoints (get/update client ID, secret, tenant)
- Generate and return redirect URI

#### [MODIFY] [user.py](file:///c:/Users/opole/Downloads/ChatBotn/backend/app/schemas/user.py)
- Add schema for user details with role source
- Add OAuth configuration schemas
- Add group mapping list schema

---

### Frontend Enhancements

#### [MODIFY] [page.tsx](file:///c:/Users/opole/Downloads/ChatBotn/frontend/src/app/settings/users/page.tsx)
- Add user edit dialog with role management
- Display role source (MANUAL vs MAPPED) with read-only mapped roles
- Add filter controls (Active/Inactive/No Role/Auth Type)
- Add search functionality

#### [NEW] [roles-tab.tsx](file:///c:/Users/opole/Downloads/ChatBotn/frontend/src/components/settings/roles-tab.tsx)
- Role list table
- Create role dialog
- Edit role dialog (name, description, permissions)
- Delete role with confirmation
- Show users assigned to each role

#### [NEW] [group-mapping-tab.tsx](file:///c:/Users/opole/Downloads/ChatBotn/frontend/src/components/settings/group-mapping-tab.tsx)
- Searchable dropdown (autocomplete) for known AD groups
- Manual AD group entry option
- Role assignment interface for groups
- List of existing mappings with edit/delete

#### [NEW] [oauth-config-tab.tsx](file:///c:/Users/opole/Downloads/ChatBotn/frontend/src/components/settings/oauth-config-tab.tsx)
- Display read-only redirect URI with copy button
- Input fields for Client ID, Client Secret, Tenant URL
- Save configuration button

#### [MODIFY] [page.tsx](file:///c:/Users/opole/Downloads/ChatBotn/frontend/src/app/settings/page.tsx)
- Add tabs for Roles, Group Mapping, and OAuth Config (admin only)

## Verification Plan

### Manual Verification

1. **User Management**
   - Login as admin (admin@example.com / admin123)
   - Navigate to Settings → User Management
   - Create a new user with multiple roles
   - Edit user and change roles
   - Filter users by Active/Inactive
   - Toggle user active status

2. **Role Management**
   - Navigate to Settings → Roles
   - Create a new role (e.g., "Editor")
   - Edit role description
   - Assign role to users
   - Delete role and verify users are reassigned to "User" role

3. **Group Mapping** (UI only, no actual SSO)
   - Navigate to Settings → Group Mapping
   - Manually add an AD group
   - Assign roles to the group
   - View and edit existing mappings

4. **OAuth Configuration** (UI only)
   - Navigate to Settings → OAuth Config
   - Verify redirect URI is displayed and copyable
   - Enter test Client ID, Secret, Tenant URL
   - Save configuration

### Browser Testing
- Test all dialogs open/close properly
- Verify responsive design
- Test form validation
- Verify role badges display correctly with source indicators
