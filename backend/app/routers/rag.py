from fastapi import APIRouter, HTTPException, UploadFile, File
from pydantic import BaseModel
from typing import List, Optional
import os
import shutil
from app.services.rag_service import rag_service

router = APIRouter()

class IngestRequest(BaseModel):
    folder_path: str
    chunk_size: Optional[int] = 1000
    chunk_overlap: Optional[int] = 200

class QueryRequest(BaseModel):
    query: str
    k: Optional[int] = 4

@router.post("/rag/ingest")
async def ingest_documents(request: IngestRequest):
    try:
        result = rag_service.ingest_folder(
            request.folder_path, 
            chunk_size=request.chunk_size, 
            chunk_overlap=request.chunk_overlap
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/rag/query")
async def query_documents(request: QueryRequest):
    try:
        results = rag_service.query(request.query, request.k)
        return {"results": results}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/rag/reset")
async def reset_db():
    try:
        rag_service.reset_db()
        return {"status": "success", "message": "Database reset"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/rag/upload/{conversation_id}")
async def upload_file(conversation_id: str, file: UploadFile = File(...)):
    try:
        # Create directory for conversation uploads
        upload_dir = f"data/uploads/{conversation_id}"
        os.makedirs(upload_dir, exist_ok=True)
        
        file_path = os.path.join(upload_dir, file.filename)
        
        # Save file
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
        from starlette.concurrency import run_in_threadpool
        
        # Ingest file (Run in threadpool to avoid blocking loop and allow VLM async calls)
        result = await run_in_threadpool(
            rag_service.ingest_file,
            file_path, 
            conversation_id,
            metadata=None,
            progress_callback=None,
            model_name=None,
            vision_model_name=None,
            enable_vision=True
        )
        
        return {
            "filename": file.filename,
            "status": "uploaded_and_ingested",
            "rag_result": result
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/rag/documents/{conversation_id}")
async def list_documents(conversation_id: str):
    try:
        documents = rag_service.list_documents(conversation_id)
        return {"documents": documents}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/rag/documents/{conversation_id}/{filename}")
async def get_document_content(conversation_id: str, filename: str):
    try:
        content = rag_service.get_document_content(conversation_id, filename)
        return {"content": content}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/rag/documents/{conversation_id}/{filename}")
async def delete_document(conversation_id: str, filename: str):
    try:
        success = rag_service.delete_document(conversation_id, filename)
        if success:
            return {"status": "success", "message": "Document deleted"}
        else:
            raise HTTPException(status_code=500, detail="Failed to delete document")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
