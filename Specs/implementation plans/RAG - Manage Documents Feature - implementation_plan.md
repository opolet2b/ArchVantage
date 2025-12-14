# Manage Documents Feature

## Goal Description
Add a "Manage Documents" option to the conversation context menu. This will open a popup listing the documents attached to the conversation. Users can view document content, delete documents (with confirmation), and upload new documents.

## User Review Required
None.

## Proposed Changes

### Backend

#### [MODIFY] [rag_service.py](file:///c:/Users/opole/Downloads/ChatBotn/backend/app/services/rag_service.py)
- Add `list_documents(conversation_id)`: Returns list of filenames.
- Add `get_document_content(conversation_id, filename)`: Returns file content.
- Add `delete_document(conversation_id, filename)`: Deletes file and removes embeddings.

#### [MODIFY] [rag.py](file:///c:/Users/opole/Downloads/ChatBotn/backend/app/routers/rag.py)
- Add `GET /rag/documents/{conversation_id}`.
- Add `GET /rag/documents/{conversation_id}/{filename}`.
- Add `DELETE /rag/documents/{conversation_id}/{filename}`.

### Frontend

#### [NEW] [document-manager.tsx](file:///c:/Users/opole/Downloads/ChatBotn/frontend/src/components/sidebar/document-manager.tsx)
- Create a dialog component to manage documents.
- List documents with "View" and "Delete" actions.
- "View" opens a preview of the content.
- "Delete" shows a confirmation dialog before deleting.
- "Upload" button to add new files.

#### [MODIFY] [conversation-list.tsx](file:///c:/Users/opole/Downloads/ChatBotn/frontend/src/components/sidebar/conversation-list.tsx)
- Add "Manage Documents" item to the dropdown menu.
- Integrate `DocumentManager` component.

## Verification Plan

### Manual Verification
1.  **Open Menu**: Click the 3 dots on a conversation.
2.  **Open Manager**: Click "Manage Documents".
3.  **Upload**: Upload a file and verify it appears in the list.
4.  **View**: Click a file to view its content.
5.  **Delete**: Click delete, confirm, and verify it's removed from the list and backend.
