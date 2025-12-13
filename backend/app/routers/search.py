from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from app.services.search_service import search_service

router = APIRouter()

class SearchRequest(BaseModel):
    query: str

@router.post("/search")
async def search_endpoint(request: SearchRequest):
    result = search_service.search(request.query)
    return {"result": result}
