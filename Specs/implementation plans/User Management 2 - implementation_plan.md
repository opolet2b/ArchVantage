# User Management Implementation Plan

## Goal Description
Implement a complete User Management system. The backend already has core RBAC and Auth endpoints. The focus is on creating the Frontend Authentication infrastructure (Login, Context, Protected Routes) and the User Management UI, while verifying and tweaking the backend as needed.

## User Review Required
> [!IMPORTANT]
> **Default Admin User**: We will need to seed a default admin user if one doesn't exist, otherwise you won't be able to log in to the new protected UI.
> **Auth Strategy**: We are using JWT stored in localStorage (or memory) for simplicity as per current backend design.

## Proposed Changes

### Backend
#### [MODIFY] [main.py](file:///c:/Users/opole/Downloads/ChatBotn/backend/main.py)
- Ensure CORS is correctly configured for the frontend URL.
- Add a startup script to seed default roles and admin user.

#### [NEW] [app/core/init_db.py](file:///c:/Users/opole/Downloads/ChatBotn/backend/app/core/init_db.py)
- Script to initialize the database with default roles (Admin, User) and a default Admin user.

### Frontend
#### [NEW] [src/lib/auth-context.tsx](file:///c:/Users/opole/Downloads/ChatBotn/frontend/src/lib/auth-context.tsx)
- React Context to handle `login`, `logout`, and `user` state.
- Persist token in `localStorage`.

#### [NEW] [src/app/login/page.tsx](file:///c:/Users/opole/Downloads/ChatBotn/frontend/src/app/login/page.tsx)
- Login form component.
- Redirects to `/` on success.

#### [NEW] [src/components/auth-guard.tsx](file:///c:/Users/opole/Downloads/ChatBotn/frontend/src/components/auth-guard.tsx)
- Component to protect routes. Redirects to `/login` if not authenticated.

#### [MODIFY] [src/app/layout.tsx](file:///c:/Users/opole/Downloads/ChatBotn/frontend/src/app/layout.tsx)
- Wrap application in `AuthProvider`.

#### [NEW] [src/app/settings/users/page.tsx](file:///c:/Users/opole/Downloads/ChatBotn/frontend/src/app/settings/users/page.tsx)
- Admin-only page to list, create, and edit users.
- Assign roles to users.

## Verification Plan

### Automated Tests
- None planned for this phase (UI heavy).

### Manual Verification
1. **Seed DB**: Run backend and check if default admin exists.
2. **Login**: Access frontend, be redirected to `/login`. Log in with default credentials.
3. **Persistence**: Refresh page, ensure still logged in.
4. **Logout**: Click logout, ensure redirected to login.
5. **User Management**:
    - Create a new user "Test User".
    - Log out and log in as "Test User".
    - Verify "Test User" cannot access Admin settings (if RBAC enforced on frontend).
