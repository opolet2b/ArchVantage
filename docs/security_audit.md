# Security Audit: Authorization Management

**Date:** 2026-05-11
**Auditor:** Antigravity AI
**Scope:** Backend Authentication & Authorization (FastAPI)

---

## 1. Executive Summary
The ArchVantage project implements a multi-layered authorization system based on **JWT Authentication** and **Role-Based Access Control (RBAC)**. While core mechanisms for User and Role management are solid, several gaps exist in resource-level authorization (Tools) and sharing logic (Assets).

---

## 2. Current State of Security

### 2.1 Authentication
- **Mechanism:** OAuth2 Password Bearer with JWT (HS256).
- **Password Hashing:** PBKDF2 with SHA256 (Passlib).
- **Token Expiry:** 24 hours (1440 minutes).
- **Vulnerability:** `SECRET_KEY` in `security.py` has a hardcoded default value. This is a critical risk if not overridden in production environments.

### 2.2 Authorization Models
- **Canvas:** Protected by a helper `_get_canvas_with_access` which checks for:
  - Ownership (`owner_id`)
  - Direct user sharing (`allowed_users`)
  - Role-based sharing (`allowed_roles`)
- **Templates:** Implements a robust folder-based permission system (READ, WRITE, DENY) with inheritance.
- **SSO Integration:** Supports mapping Active Directory (AD) groups to local roles via `KnownADGroup` and `GroupMapping`.

---

## 3. Identified Gaps & Vulnerabilities

### 3.1 Tool Authorization Gaps (Medium Severity)
- **Problem:** While tool *discovery* (listing) is authorized, direct access to tool details and execution is not.
- **Affected Routes:**
  - `GET /api/v1/tools/{tool_id}`: Any authenticated user can read any tool's configuration/system prompt.
  - `POST /api/v1/tools/{tool_id}/execute`: Any authenticated user can execute any tool if they know the ID.
- **Impact:** Potential leakage of sensitive system prompts or unauthorized usage of expensive/destructive tools.

### 3.2 Asset Sharing Logic (Functional/Security Conflict)
- **Problem:** Asset streaming (`/api/v1/assets/{id}`) strictly checks `owner_id == current_user.id`.
- **Impact:** Shared canvases are partially broken. If User A shares a canvas with User B, User B cannot view images or PDFs in that canvas because they do not own the underlying assets.
- **Recommendation:** Authorization should check if the user has access to *at least one canvas* that contains the requested asset.

### 3.3 Lack of User Self-Service
- **Problem:** All user management (including password resets/profile updates) requires the `Admin` role.
- **Impact:** Maintenance burden for administrators; users cannot manage their own security settings.

---

## 4. Proposed Improvements

### Phase 1: Immediate Fixes (Short Term)
1.  **Secure Secret Management:** Move `SECRET_KEY` to mandatory environment variable; remove hardcoded default.
2.  **Fix Tool Access:** Add ownership/permission checks to `read_tool` and `execute_tool` routes in `tools.py`.
3.  **Context-Aware Asset Access:** Update `asset_service.get_asset_stream` to allow access if the user has read permission on any canvas linked to the asset.

### Phase 2: Enhanced Robustness (Long Term)
1.  **Granular Scopes:** Introduce OAuth2 scopes (e.g., `tools:read`, `canvas:write`) for more fine-grained control.
2.  **Audit Logging:** Implement a formal audit log service (beyond simple debug logging) for all sensitive operations (deletions, permission changes, logins).
3.  **User Profile Endpoint:** Add a `/users/me` (PATCH) endpoint to allow users to update their own passwords and details safely.
4.  **Password Policy:** Implement minimum complexity requirements for internal accounts.

---

## 5. Summary Table

| Resource | Authorization Level | Status | Notes |
| :--- | :--- | :--- | :--- |
| **Authentication** | JWT / Bcrypt | ✅ Good | Hardcoded secret needs fixing. |
| **Canvas** | Owner / Share / Role | ✅ Good | Consistent across CRUD. |
| **Templates** | Folder-level RBAC | ✅ Excellent | Most robust part of the system. |
| **Tools** | Tree-only | ⚠️ Partial | Missing checks on GET/POST by ID. |
| **Assets** | Owner-only | ⚠️ Issues | Breaks sharing functionality. |
| **User Mgmt** | Admin-only | ℹ️ Limited | Lacks self-service for users. |
