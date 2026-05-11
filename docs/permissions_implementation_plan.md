# Implementation Plan: Granular Permissions Integration [COMPLETED]

This plan outlines the steps to move from a coarse role-based system (Admin only) to a fine-grained permission-based system using the existing `Role.permissions` field.

## 1. Permission Registry

We will use the following standard permission strings:

| Module | Read Permissions | Write Permissions |
| :--- | :--- | :--- |
| **Canvas** | `canvas:read` | `canvas:write` |
| **Chat** | `chat:use` | - |
| **Smart Analysis** | `analysis:read` | `analysis:write` |
| **Agents** | `agent:read` | `agent:write` |
| **Tools** | `tool:read` | `tool:write` |
| **Scenarios** | `scenario:read` | `scenario:write` |
| **Templates** | `template:read` | `template:write` |
| **KB / RAG** | - | `kb:manage` (Admin only) |
| **Settings** | - | `settings:manage` (Admin only) |

## 2. Refactoring Steps

### Phase 1: Core Permission Updates [DONE]
1.  **Refine `PermissionChecker`**: Ensure it handles multiple roles correctly (it already does).
2.  **Update Default Roles**: 
    *   Ensure the "Admin" role is created with a full set of permissions (or handled via the admin bypass).
    *   Update the default "User" role (if it exists) to have a basic set like `canvas:read`, `canvas:write`, `chat:use`.

### Phase 2: Router Integration [DONE]
We will update the following routers to use `Depends(PermissionChecker(...))`:

1.  **`canvas.py`**:
    *   `GET /canvases` -> `canvas:read`
    *   `POST /canvases` -> `canvas:write`
    *   `POST /canvases/{id}/analyze` -> `analysis:write`
2.  **`chat.py`**:
    *   All endpoints -> `chat:use`
3.  **`agents.py` & `agent_blueprints.py`**:
    *   GET endpoints -> `agent:read`
    *   POST/PUT/DELETE -> `agent:write`
4.  **`tools.py`**:
    *   GET endpoints -> `tool:read`
    *   POST/PUT/DELETE -> `tool:write`
5.  **`scenarios.py`**:
    *   GET -> `scenario:read`
    *   POST/PUT/DELETE -> `scenario:write`
6.  **`templates.py`**:
    *   Integration with existing folder-level logic.
7.  **`knowledge.py` & `rag.py`**:
    *   Management endpoints -> `kb:manage`
8.  **`config.py`**:
    *   Update endpoints -> `settings:manage`

### Phase 3: Canvas Sharing Refinement [DONE]
Update `_get_canvas_with_access` in `canvas.py` to check for specific `canvas:read` vs `canvas:write` scopes.

## 3. Verification [DONE]
- Test that a user with a custom role containing only `canvas:read` cannot create canvases or analyze documents.
- Test that Admin retains full access regardless of permission strings.
