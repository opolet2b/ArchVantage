import requests

# We need a valid token and canvas_id.
# Let's extract token and canvas_id from sqlite database
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
import sys
import os

sys.path.append(os.getcwd())
from app.core.database import SessionLocal
from app.models.user_models import User
from app.models.canvas_models import Canvas

db = SessionLocal()
user = db.query(User).first()
canvas = db.query(Canvas).filter(Canvas.owner_id == user.id).first()

if not user or not canvas:
    print("No user or canvas found")
    sys.exit()

# We need to create an auth token for the user 
from app.core.security import create_access_token
token = create_access_token({"sub": str(user.id)})

url = f"http://localhost:8000/api/v1/canvases/{canvas.id}/things"
headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
payload = {
    "type": "conversation",
    "content": {"conversation_id": "dummy_123", "messages": []},
    "position": {"x": 100, "y": 100},
    "title": "New Conversation",
    "size": {}
}
response = requests.post(url, headers=headers, json=payload)
print(response.status_code)
print(response.text)
