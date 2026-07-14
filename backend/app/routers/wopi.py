from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
import os
import datetime

from app.core.database import get_db
from app.services.asset_service import asset_service
from app.models.asset_models import Asset
from app.services.rag_service import rag_service
from fastapi import BackgroundTasks
import hashlib

router = APIRouter(tags=["wopi"])

@router.get("/wopi/files/{file_id}")
async def check_file_info(file_id: str, request: Request, db: Session = Depends(get_db)):
    """WOPI CheckFileInfo endpoint"""
    print(f"[WOPI] CheckFileInfo requested for file {file_id}")
    
    # We bypass strict user auth for WOPI since Collabora server calls this directly,
    # but in a real app we'd validate the access token passed by WOPI.
    asset = db.query(Asset).filter(Asset.id == file_id).first()
    
    if not asset:
        print(f"[WOPI] File {file_id} not found")
        raise HTTPException(status_code=404, detail="File not found")
        
    file_path = asset_service.get_storage_path(asset)
    
    if not os.path.exists(file_path):
        print(f"[WOPI] Physical file not found at {file_path}")
        raise HTTPException(status_code=404, detail="Physical file not found")
        
    # Required WOPI properties
    file_info = {
        "BaseFileName": asset.original_name,
        "OwnerId": str(asset.owner_id),
        "Size": os.path.getsize(file_path),
        "UserId": "admin", # Hardcoded for now
        "Version": str(os.path.getmtime(file_path)),
        
        # Permissions
        "UserCanWrite": True,
        "SupportsUpdate": True,
        "SupportsLocks": False,
    }
    
    return file_info

@router.get("/wopi/files/{file_id}/contents")
async def get_file_contents(file_id: str, request: Request, db: Session = Depends(get_db)):
    """WOPI GetFile endpoint"""
    print(f"[WOPI] GetFile requested for file {file_id}")
    
    asset = db.query(Asset).filter(Asset.id == file_id).first()
    
    if not asset:
        raise HTTPException(status_code=404, detail="File not found")
        
    file_path = asset_service.get_storage_path(asset)
    
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Physical file not found")
        
    return FileResponse(
        path=file_path,
        filename=asset.original_name,
        media_type=asset.mime_type
    )

@router.post("/wopi/files/{file_id}/contents")
async def put_file_contents(
    file_id: str, 
    request: Request, 
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    """WOPI PutFile endpoint"""
    print(f"[WOPI] PutFile requested for file {file_id}")
    
    asset = db.query(Asset).filter(Asset.id == file_id).first()
    if not asset:
        raise HTTPException(status_code=404, detail="File not found")
        
    file_path = asset_service.get_storage_path(asset)
    
    # Read the raw binary content from the request body
    body = await request.body()
    
    # Save the new content
    with open(file_path, "wb") as f:
        f.write(body)
        
    # Update Asset metadata
    new_size = len(body)
    new_hash = hashlib.sha256(body).hexdigest()
    
    asset.size_bytes = new_size
    asset.file_hash = new_hash
    db.commit()
    
    # Trigger re-ingestion since the document changed!
    def ingest_asset_for_user(asset_id, path, user_id):
        try:
            print(f"[WOPI] Starting background re-ingestion for asset {asset_id}")
            rag_service.ingest_file(
                path,
                metadata={
                    "asset_id": str(asset_id), 
                    "owner_id": str(user_id), 
                    "source": "wopi_update"
                }
            )
            print(f"[WOPI] Background re-ingestion finished")
        except Exception as e:
            print(f"[WOPI] Background re-ingestion failed: {e}")
            
    background_tasks.add_task(ingest_asset_for_user, asset.id, file_path, asset.owner_id)
    
    return Response(status_code=200)

from app.models.canvas_models import CanvasThing
import time
from sqlalchemy.orm.attributes import flag_modified

@router.get("/wopi/things/{thing_id}")
async def check_thing_info(thing_id: str, request: Request, db: Session = Depends(get_db)):
    """WOPI CheckFileInfo endpoint for Canvas Things (Virtual text nodes)"""
    print(f"[WOPI] CheckFileInfo requested for thing {thing_id}")
    
    thing = db.query(CanvasThing).filter(CanvasThing.id == thing_id).first()
    if not thing:
        raise HTTPException(status_code=404, detail="Thing not found")
        
    text_content = thing.content.get("text_content", thing.content.get("text", ""))
    size = len(text_content.encode('utf-8'))
    
    file_info = {
        "BaseFileName": f"Note_{thing.id}.txt",
        "OwnerId": "admin",
        "Size": size,
        "UserId": "admin",
        "Version": str(time.time()),
        "UserCanWrite": True,
        "SupportsUpdate": True,
        "SupportsLocks": False,
    }
    return file_info

@router.get("/wopi/things/{thing_id}/contents")
async def get_thing_contents(thing_id: str, request: Request, db: Session = Depends(get_db)):
    """WOPI GetFile endpoint for Canvas Things"""
    print(f"[WOPI] GetFile requested for thing {thing_id}")
    
    thing = db.query(CanvasThing).filter(CanvasThing.id == thing_id).first()
    if not thing:
        raise HTTPException(status_code=404, detail="Thing not found")
        
    text_content = thing.content.get("text_content", thing.content.get("text", ""))
    return Response(content=text_content.encode('utf-8'), media_type="text/plain")

@router.post("/wopi/things/{thing_id}/contents")
async def put_thing_contents(thing_id: str, request: Request, db: Session = Depends(get_db)):
    """WOPI PutFile endpoint for Canvas Things"""
    print(f"[WOPI] PutFile requested for thing {thing_id}")
    
    thing = db.query(CanvasThing).filter(CanvasThing.id == thing_id).first()
    if not thing:
        raise HTTPException(status_code=404, detail="Thing not found")
        
    body = await request.body()
    try:
        new_text = body.decode('utf-8')
    except UnicodeDecodeError:
        new_text = body.decode('latin-1')
        
    # Update text_content in JSON
    new_content = dict(thing.content)
    if "text" in new_content and "text_content" not in new_content:
        new_content["text"] = new_text
    else:
        new_content["text_content"] = new_text
        
    thing.content = new_content
    flag_modified(thing, "content")
    db.commit()
    
    return Response(status_code=200)
