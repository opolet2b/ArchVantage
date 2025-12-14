# Manage Documents Feature Walkthrough

I have implemented the "Manage Documents" feature, allowing users to view, upload, and delete documents associated with a conversation.

## Changes

### Backend
- **`rag_service.py`**: Added `list_documents`, `get_document_content`, and `delete_document` methods.
- **`rag.py`**: Added API endpoints for listing, retrieving content, and deleting documents.

### Frontend
- **`document-manager.tsx`**: Created a new component to manage documents. It features:
    - A list of attached documents.
    - A document viewer.
    - An upload button to add new files.
    - A delete button (trash icon) in the list to remove files.
    - **[NEW]** A "Delete" button in the document viewer header for convenience.
- **`conversation-list.tsx`**: Integrated the `DocumentManager` into the conversation context menu ("Manage Documents").
- **`conversation-list.tsx`**: Fixed a bug where clicking a conversation title from other pages (e.g., Settings) did not navigate back to the chat view. Added `router.push("/")` to the click handler.

## Verification

### Automated Verification Attempts
I attempted to verify the feature using an automated browser agent.
- **Menu Interaction**: The contextual menu (3 dots) proved difficult to open reliably via automation due to hover states and overlay handling.
- **File Upload**: Automated file upload via hidden inputs is complex and was not fully successful in the test environment.
- **Document Viewing**: When the dialog was manually forced open, I could verify that the document list and viewer structure were present.

### Manual Verification Steps
To verify the feature manually:
1.  Hover over a conversation in the sidebar.
2.  Click the 3-dots menu button.
3.  Select "Manage Documents".
4.  **Upload**: Click the upload icon and select a file. Verify it appears in the list.
5.  **View**: Click a file in the list. Verify its content is shown in the right pane.
6.  **Delete**: Click the trash icon in the list OR the "Delete" button in the viewer header. Confirm deletion. Verify the file is removed.

## Screenshots
(Note: Automated screenshots were limited due to the interaction issues described above.)
