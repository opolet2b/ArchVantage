from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import HTMLResponse
from app.services.ocr_service import ocr_service

router = APIRouter()

@router.post("/start")
async def start_ocr_job(file: UploadFile = File(...), vlm_config: str = Form(None)):
    """
    Start an asynchronous OCR conversion job.
    Accepts PDF or Image files.
    """
    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename provided")
    
    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(status_code=400, detail="Empty file")

    job_id = ocr_service.start_job(file_bytes, file.filename, vlm_config=vlm_config)
    return {"job_id": job_id, "status": "started"}

@router.get("/status/{job_id}")
async def get_ocr_job_status(job_id: str):
    """
    Get the status of an ongoing OCR job.
    Returns: status (pending, processing, completed, error), progress (0-100), error message if any.
    """
    job = ocr_service.get_job_status(job_id)
    if job.get("status") == "error" and job.get("error") == "Job not found":
        raise HTTPException(status_code=404, detail="Job not found")
        
    return {
        "job_id": job_id,
        "status": job["status"],
        "progress": job["progress"],
        "error": job.get("error"),
        "total_pages": job.get("total_pages"),
        "current_page": job.get("current_page"),
        "start_time": job.get("start_time")
    }

@router.get("/download/{job_id}")
async def download_ocr_result(job_id: str):
    """
    Download the generated HTML result.
    Only available when status == "completed".
    """
    job = ocr_service.get_job_status(job_id)
    if job.get("status") == "error" and job.get("error") == "Job not found":
        raise HTTPException(status_code=404, detail="Job not found")
        
    if job["status"] != "completed":
        raise HTTPException(status_code=400, detail=f"Job not completed. Current status: {job['status']}")
        
    html_content = job.get("result")
    if not html_content:
        raise HTTPException(status_code=500, detail="Result is empty")
        
    return HTMLResponse(content=html_content)
