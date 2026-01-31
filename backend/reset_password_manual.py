import sys
import os
from sqlalchemy.orm import Session
from app.core.database import SessionLocal
from app.models.user import User
from app.core.security import get_password_hash

def reset_password(email, new_password):
    db: Session = SessionLocal()
    try:
        user = db.query(User).filter(User.email == email).first()
        if not user:
            print(f"Error: User with email '{email}' not found.")
            return

        print(f"Found user: {user.email} (ID: {user.id})")
        user.password_hash = get_password_hash(new_password)
        db.commit()
        print(f"Success: Password for '{email}' has been reset to '{new_password}'.")
    except Exception as e:
        print(f"Error resetting password: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python reset_password_manual.py <email> <new_password>")
        print("Example: python reset_password_manual.py admin@example.com newpassword123")
    else:
        email = sys.argv[1]
        password = sys.argv[2]
        reset_password(email, password)
