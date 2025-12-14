# User Management Implementation Plan

## Goal Description
Implement a complete User Management system for the ChatBot application. This includes:
- **Authentication**: Support for Internal users (email/password) and SSO users (OAuth/AD).
- **Authorization**: Role-Based Access Control (RBAC) with Admin, Power-user, and User roles.
- **User Management**: Admin interface to create, update, and inactivate users.
- **Group Mapping**: Mechanism to map AD groups to internal roles with lazy discovery of AD groups.
- **Settings UI**: Dedicated settings tabs for User Profile, User Management, Role Management, and Group Mapping.

## User Review Required
> [!IMPORTANT]
> **Database Choice**: I will use **SQLAlchemy** as the ORM (Object-Relational Mapper).
> -   **Default**: **SQLite** (File-based, zero-config) for immediate development and testing.
> -   **Production-Ready**: Because we are using SQLAlchemy, switching to **PostgreSQL** later is trivial (just changing the connection string in `.env`). The code will be database-agnostic.
> -   This approach avoids the immediate need for you to install/configure a Postgres server locally while ensuring the app is ready for a robust DB in production.

> [!WARNING]
> **Authentication**: The system will now require login. Existing "anonymous" access will be restricted.

## Proposed Changes

### Backend

#### [MODIFY] [requirements.txt](file:///c:/Users/opole/Downloads/ChatBotn/backend/requirements.txt)
- Add `sqlalchemy`
- Add `passlib[bcrypt]`
- Add `python-jose[cryptography]`

#### [NEW] [backend/app/core/database.py](file:///c:/Users/opole/Downloads/ChatBotn/backend/app/core/database.py)
- Setup SQLAlchemy engine and session factory.
- Define `Base` for models.

#### [NEW] [backend/app/models/user.py](file:///c:/Users/opole/Downloads/ChatBotn/backend/app/models/user.py)
- Define `User`, `Role`, `UserRole`, `KnownADGroup`, `GroupMapping` SQLAlchemy models.

#### [NEW] [backend/app/schemas/user.py](file:///c:/Users/opole/Downloads/ChatBotn/backend/app/schemas/user.py)
- Define Pydantic models for User/Role/Group API interactions (Create, Read, Update).

#### [NEW] [backend/app/core/security.py](file:///c:/Users/opole/Downloads/ChatBotn/backend/app/core/security.py)
- Password hashing utilities (bcrypt).
- JWT token generation and verification.

#### [NEW] [backend/app/routers/auth.py](file:///c:/Users/opole/Downloads/ChatBotn/backend/app/routers/auth.py)
- Login endpoint (OAuth2PasswordRequestForm).
- SSO callback endpoint (placeholder logic for now, as actual SSO requires IdP setup).
- Token refresh endpoint.

#### [NEW] [backend/app/routers/users.py](file:///c:/Users/opole/Downloads/ChatBotn/backend/app/routers/users.py)
- CRUD endpoints for Users (Admin only).
- Profile update endpoints (Self).

#### [NEW] [backend/app/routers/roles.py](file:///c:/Users/opole/Downloads/ChatBotn/backend/app/routers/roles.py)
- CRUD endpoints for Roles (Admin only).
- Group Mapping endpoints.

#### [MODIFY] [backend/main.py](file:///c:/Users/opole/Downloads/ChatBotn/backend/main.py)
- Include new routers (`auth`, `users`, `roles`).
- Initialize database tables on startup.

### Frontend

#### [NEW] [frontend/src/lib/auth-context.tsx](file:///c:/Users/opole/Downloads/ChatBotn/frontend/src/lib/auth-context.tsx)
- React Context to hold user state (user info, token, roles).
- Login/Logout methods.

#### [NEW] [frontend/src/pages/login.tsx](file:///c:/Users/opole/Downloads/ChatBotn/frontend/src/pages/login.tsx)
- Login page with Email/Password form.
- "Login with SSO" button.

#### [MODIFY] [frontend/src/App.tsx](file:///c:/Users/opole/Downloads/ChatBotn/frontend/src/App.tsx)
- Wrap app in `AuthProvider`.
- Add `ProtectedRoute` component to redirect to login if not authenticated.

#### [NEW] [frontend/src/components/settings/user-management.tsx](file:///c:/Users/opole/Downloads/ChatBotn/frontend/src/components/settings/user-management.tsx)
- Admin UI for listing and managing users.

#### [NEW] [frontend/src/components/settings/role-management.tsx](file:///c:/Users/opole/Downloads/ChatBotn/frontend/src/components/settings/role-management.tsx)
- Admin UI for managing roles.

#### [NEW] [frontend/src/components/settings/group-mapping.tsx](file:///c:/Users/opole/Downloads/ChatBotn/frontend/src/components/settings/group-mapping.tsx)
- Admin UI for mapping AD groups to roles.

#### [MODIFY] [frontend/src/components/settings/settings-dialog.tsx](file:///c:/Users/opole/Downloads/ChatBotn/frontend/src/components/settings/settings-dialog.tsx)
- Add new tabs for User/Role/Group management (visible only to Admins).

## Verification Plan

### Automated Tests
- I will create a script `verify_auth.py` to:
    1.  Create a default Admin user.
    2.  Login as Admin and verify token.
    3.  Create a new Internal User via API.
    4.  Verify the new user can login.
    5.  Verify RBAC (User cannot access Admin endpoints).

### Manual Verification
- **Login Flow**: Verify I can login with the default admin credentials.
- **User Management**: Create a new user from the UI, verify they show up in the list.
- **Role Management**: Create a new role, assign it to a user.
- **Settings Access**: Verify non-admin users cannot see Admin tabs.
