# Verification Walkthrough - File Attachment & RAG

I have implemented the file attachment feature. You can now upload files to a conversation, and they will be vectorized for RAG. When you delete a conversation, the associated files and embeddings are also deleted.

## Changes Implemented

### Backend
- **RAG Service**: Added `ingest_file` to handle individual file uploads and associate them with a `conversation_id`. Added `delete_conversation_embeddings` to remove embeddings when a conversation is deleted.
- **RAG Router**: Added `POST /rag/upload/{conversation_id}` endpoint to handle file uploads.
- **Conversation Service**: Updated `delete_conversation` to trigger the cleanup of embeddings and uploaded files.

### Frontend
- **Chat Interface**: Wired up the paperclip icon to a hidden file input. Implemented `handleFileSelect` to upload the file and display a success message in the chat.

## How to Verify

1.  **Reload the Page**: Refresh your browser to ensure the latest frontend code is loaded.
2.  **Start a Conversation**: Create a new conversation or use an existing one.
3.  **Attach a File**:
    - Click the **Paperclip** icon in the chat input area.
    - Select a text-based file (PDF, DOCX, TXT, MD).
    - Wait for the "File Uploaded" message to appear in the chat.
4.  **Ask a Question**: Ask a question related to the content of the uploaded file to verify RAG is working (e.g., "What is the summary of the document I just uploaded?").
5.  **Delete Conversation**:
    - Open the sidebar (if not open).
    - Delete the conversation using the context menu.
6.  **Verify Cleanup** (Optional):
    - Check `backend/data/uploads` to ensure the folder for that conversation ID is gone.
    - (Advanced) Query ChromaDB to ensure embeddings are gone.
