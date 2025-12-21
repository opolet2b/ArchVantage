import sys
import os

# Add current directory to path so we can import app modules
sys.path.append(os.getcwd())

from app.core.database import SessionLocal
from app.models.user import User
from app.core.security import get_password_hash

def reset_password():
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == "admin@example.com").first()
        if user:
            print(f"Found user {user.email}")
            print(f"Old hash start: {user.password_hash[:10]}...")
            user.password_hash = get_password_hash("admin123")
            db.commit()
            print("Password updated successfully to 'admin123'")
        else:
            print("User 'admin@example.com' not found!")
    except Exception as e:
        print(f"Error: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    reset_password()
