# Security Audit: Role Permissions Analysis

**Date:** 2026-05-11
**Auditor:** Antigravity AI
**Topic:** Granular Permissions & Role-Based Access Control (RBAC)

---

## 1. Current State Assessment (Post-Implementation)

The granular permission system has been **fully implemented and enforced** across the backend. 

### 1.1 Active Permissions Model
The `Role` model's `permissions` JSON column is now the primary source of truth for functional authorization.
- **Enforcement:** The `PermissionChecker` dependency is integrated into all major routers (Canvas, Agents, Chat, Scenarios, Templates, Knowledge, Config).
- **Result:** Administrative checks no longer rely solely on the "Admin" role name; they verify specific functional scopes (e.g., `settings:manage`, `kb:manage`).

### 1.2 Fragmented Authorization Logic
Instead of a centralized permission system, authorization is currently "siloed" across modules using different patterns:
| Module | Mechanism | Pattern |
| :--- | :--- | :--- |
| **Canvases** | Relationship-based | Owner / AllowedUser / AllowedRole (All-or-nothing access) |
| **Templates** | Dedicated Table | `TemplatePermission` with READ/WRITE/DENY levels. |
| **Tools** | Dedicated Table | `ToolPermission` with READ/READ_WRITE levels. |
| **System** | Hardcoded Role Name | Checks for "Admin" role for User/Role/MCP management. |

---

## 2. Identified Gaps

### 2.1 Lack of Functional Permissions
There are no global permissions to restrict basic functional capabilities. Currently, any authenticated user can:
- **Create Canvases**: No `canvas:create` restriction.
- **Use Tools**: No `tool:use` restriction (beyond individual tool sharing).
- **Update KB**: No `rag:update` restriction.

### 2.2 Coarse-Grained Canvas Sharing
Canvas sharing is binary. If a user is "allowed," they have full control (add, delete, update). There is no "Read-Only" or "Observer" state for shared canvases.

### 2.3 Role Rigidity
Because the system checks for the literal name "Admin", it is impossible to create a "Technical Support" role that can manage MCP servers but cannot delete users, or a "Content Manager" who can manage Templates but not Canvases.

---

## 3. Proposed Standardized Permission Map

To fix this, we should populate and utilize the `permissions` JSON field with standardized strings.

### 3.1 Proposed Permissions List
| Category | Permission String | Description |
| :--- | :--- | :--- |
| **Canvas** | `canvas:create` | Ability to create new canvases. |
| | `canvas:view_all` | Administrative view of all system canvases. |
| | `canvas:delete_any`| Administrative deletion of any canvas. |
| **Tools** | `tool:use` | General ability to execute any public tool. |
| | `tool:create` | Ability to create custom tools. |
| | `tool:manage_mcp` | Ability to configure MCP servers. |
| **KB / RAG** | `kb:update` | Ability to trigger vectorization or clear KB. |
| | `kb:query` | Ability to search the Knowledge Base. |
| **Admin** | `user:manage` | CRUD operations on users. |
| | `role:manage` | CRUD operations on roles and permissions. |

---

## 4. Implementation Roadmap

### Phase 1: Permission Checker Integration
- Replace `get_current_admin_user` with `PermissionChecker("user:manage")` or similar where appropriate.
- Update the default "Admin" role to include a full set of these strings.
- Add checks like `Depends(PermissionChecker("canvas:create"))` to the `POST /canvases` route.

### Phase 2: Multi-Level Canvas Sharing
- Modify `Canvas.allowed_users` and `Canvas.allowed_roles` to use an association table with a `permission_level` (READ vs WRITE).
- Update `_get_canvas_with_access` to return both the canvas and the user's effective permission level.

### Phase 3: UI Enforcement
- Update the frontend to hide "Add Thing" or "Delete" buttons if the user has `READ` only access.
- Disable "New Canvas" button for users lacking `canvas:create`.
