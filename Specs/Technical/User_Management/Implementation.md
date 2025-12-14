# User Management - Technical Specification

**Related Functional Spec**: [Overview.md](./Overview.md)
**Status**: Draft

## 1. Architecture

### 1.1 Authentication (`routers/auth.py`)
- **Protocol**: OAuth2 Password Flow (Bearer Token).
- **Tokens**: JWT (JSON Web Tokens) with expiration.
- **Hashing**: Passwords usage bcrypt/argon2 (via `passlib` context).

### 1.2 Access Control (`routers/roles.py`, `routers/auth.py`)
- **Dependency**: `PermissionChecker` class used as a FastAPI dependency.
  ```python
  def get_current_admin_user(...): ...
  ```
- **Implicit Admin**: The "Admin" role name is hardcoded to bypass permission checks.

## 2. Data Model (`models/user.py`)
- **User**: `email`, `password_hash`, `is_active`.
- **Role**: `name`, `permissions` (JSON list).
- **UserRole**: Many-to-Many link between User and Role.
- **GroupMapping**: Links `KnownADGroup` (OID) to `Role`.

## 3. AD Integration
- **Concept**: Users logging in with AD credentials (if enabled via OAuth provider) act as a "User".
- **Mapping**: On login (or sync), the system checks `GroupMapping` table. If the user's AD tokens match a mapped group, the corresponding Role is assigned.
