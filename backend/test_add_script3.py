import sqlite3
import requests
import json
import jwt
from datetime import datetime, timedelta

SECRET_KEY = "09d25e094faa6ca2556c818166b7a9563b93f7099f6f0f4caa6cf63b88e8d3e7"
ALGORITHM = "HS256"

def create_token(user_email):
    expire = datetime.utcnow() + timedelta(minutes=60)
    to_encode = {"sub": user_email, "exp": expire}
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def run_test():
    conn = sqlite3.connect('C:\\Users\\opole\\Downloads\\ChatBotn\\backend\\db\\sql_app.db')
    cursor = conn.cursor()
    
    cursor.execute("SELECT id, email FROM users LIMIT 1")
    row = cursor.fetchone()
    if not row:
        print("No users in db")
        return
    user_id, user_email = row[0], row[1]
    
    cursor.execute("SELECT id FROM canvases WHERE owner_id=? LIMIT 1", (user_id,))
    row = cursor.fetchone()
    if not row:
        print("No canvases in db")
        return
    canvas_id = row[0]
    
    conn.close()
    
    token = create_token(user_email)
    url = f"http://localhost:8000/api/v1/canvases/{canvas_id}/things"
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    
    payload = {
        "type": "conversation",
        "content": {"conversation_id": "dummy_123", "messages": []},
        "position": {"x": 100, "y": 100},
        "size": {},
        "target_something": "ignore",
        "title": "New Conversation",
        "color": ""
    }
    
    print(f"Canvas ID: {canvas_id}")
    res = requests.post(url, headers=headers, json=payload)
    print(f"Status Code: {res.status_code}")
    print(f"Response: {res.text}")

if __name__ == "__main__":
    run_test()
