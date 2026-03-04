import sys
import os
import requests

# Insert backend directory into sys.path
sys.path.insert(0, r"C:\Users\opole\Downloads\ChatBotn\backend")

from app.core.database import SessionLocal
from app.models.user_models import User
from app.models.canvas_models import Canvas
from app.core.security import create_access_token

def test_add_thing():
    db = SessionLocal()
    user = db.query(User).first()
    if not user:
        print("No user found")
        return
        
    canvas = db.query(Canvas).filter(Canvas.owner_id == user.id).first()
    if not canvas:
        print("No canvas found")
        return

    # Create token
    token = create_access_token({"sub": str(user.id)})
    
    url = f"http://localhost:8000/api/v1/canvases/{canvas.id}/things"
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    
    payload = {
        "type": "conversation",
        "content": {"conversation_id": "dummy_123", "messages": []},
        "position": {"x": 100, "y": 100},
        "size": {},
        "target_something": "ignore",
        "title": "New Conversation",
        "domain_id": None
    }
    
    print(f"Sending payload: {payload}")
    response = requests.post(url, headers=headers, json=payload)
    print(f"Status Code: {response.status_code}")
    print(f"Response: {response.text}")

if __name__ == "__main__":
    test_add_thing()
