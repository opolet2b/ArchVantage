# Implementation Plan - File Attachment & RAG Vectorization

This plan outlines the changes required to allow users to attach files to conversations, vectorize them for RAG, and ensure embeddings are deleted when the conversation is deleted.

## User Review Required

> [!IMPORTANT]
> **File Storage**: Files will be stored in `backend/data/uploads/{conversation_id}`. This ensures we can reload them if needed, but mainly they are processed into the vector store immediately.
> **Vector Store**: We will use ChromaDB's metadata filtering to associate embeddings with conversation IDs.

## Proposed Changes

### Backend

#### [MODIFY] [rag_service.py](file:///c:/Users/opole/Downloads/ChatBotn/backend/app/services/rag_service.py)
- Update `_load_file` or ingestion logic to accept `conversation_id` and add it to document metadata.
- Add `ingest_file(file_path, conversation_id)` method.
- Add `delete_conversation_embeddings(conversation_id)` method using `vector_db.delete(where={"conversation_id": conversation_id})`.

#### [MODIFY] [rag.py](file:///c:/Users/opole/Downloads/ChatBotn/backend/app/routers/rag.py)
- Add `POST /rag/upload/{conversation_id}` endpoint.
- This endpoint will:
    1. Save the uploaded file to `data/uploads/{conversation_id}/`.
    2. Call `rag_service.ingest_file`.

#### [MODIFY] [conversation_service.py](file:///c:/Users/opole/Downloads/ChatBotn/backend/app/services/conversation_service.py)
- Import `rag_service`.
- In `delete_conversation`, call `rag_service.delete_conversation_embeddings(conv_id)`.
- Also delete the physical files in `data/uploads/{conversation_id}`.

### Frontend

#### [MODIFY] [chat-interface.tsx](file:///c:/Users/opole/Downloads/ChatBotn/frontend/src/components/chat-interface.tsx)
- Add a hidden file input element.
- Wire the Paperclip icon to trigger the file input.
- Implement `handleFileUpload` to send the file to `POST /rag/upload/{conversation_id}`.
- Add a visual indicator (toast or message) when a file is successfully uploaded and processed.

## Verification Plan

### Automated Tests
- We can add a test case in `backend/test_rag.py` (if exists or create new) to verify:
    - Ingestion with metadata.
    - Query filtering (though the user didn't explicitly ask for filtering, it's good practice, but the requirement is mainly about *deletion*).
    - Deletion of embeddings by `conversation_id`.

### Manual Verification
1.  **Start the App**: Run backend and frontend.
2.  **Create Conversation**: Start a new chat.
3.  **Attach File**: Click paperclip, select a text/pdf file.
4.  **Verify Upload**: Check server logs or `data/uploads` to see the file.
5.  **Verify Vectorization**: (Optional) Use a script to query ChromaDB and check if embeddings exist with the correct `conversation_id`.
6.  **Delete Conversation**: Delete the conversation from the UI.
7.  **Verify Deletion**:
    - Check `data/uploads` to see if the file is gone.
    - Check ChromaDB to see if embeddings are gone.
