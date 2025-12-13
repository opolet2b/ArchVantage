from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.routers.auth import get_current_admin_user
from app.models.user import User
from pydantic import BaseModel
from typing import Optional
import os

router = APIRouter()

class OAuthConfig(BaseModel):
    client_id: Optional[str] = None
    client_secret: Optional[str] = None
    tenant_url: Optional[str] = None
    redirect_uri: str

# In-memory storage for OAuth config (in production, use database)
_oauth_config = {
    "client_id": os.getenv("OAUTH_CLIENT_ID", ""),
    "client_secret": os.getenv("OAUTH_CLIENT_SECRET", ""),
    "tenant_url": os.getenv("OAUTH_TENANT_URL", ""),
}

@router.get("/oauth/config")
def get_oauth_config(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user)
):
    """Get OAuth configuration (client_secret is masked)"""
    # Generate redirect URI based on environment
    base_url = os.getenv("BASE_URL", "http://localhost:8000")
    redirect_uri = f"{base_url}/api/v1/oauth/callback"
    
    return {
        "client_id": _oauth_config.get("client_id", ""),
        "client_secret": "***" if _oauth_config.get("client_secret") else "",
        "tenant_url": _oauth_config.get("tenant_url", ""),
        "redirect_uri": redirect_uri
    }

@router.put("/oauth/config")
def update_oauth_config(
    client_id: str,
    client_secret: str,
    tenant_url: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user)
):
    """Update OAuth configuration"""
    _oauth_config["client_id"] = client_id
    _oauth_config["client_secret"] = client_secret
    _oauth_config["tenant_url"] = tenant_url
    
    return {"ok": True, "message": "OAuth configuration updated"}
