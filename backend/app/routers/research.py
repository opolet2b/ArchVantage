from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from app.services.research_service import research_service

router = APIRouter()

class ResearchRequest(BaseModel):
    query: str

@router.post("/research")
async def research_endpoint(request: ResearchRequest):
    try:
        result = await research_service.research(request.query)
        return {"result": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
