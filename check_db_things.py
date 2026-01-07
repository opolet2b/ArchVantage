import sys
import os

# Add backend to path
sys.path.append(os.path.join(os.getcwd(), "backend"))

from backend.app.core.database import SessionLocal
from backend.app.models.canvas_models import CanvasThing

def check_db():
    db = SessionLocal()
    try:
        target_id = "1bf43b9a-801c-4a29-bc21-4f6588ec2931"
        print(f"Checking for ID: {target_id}")
        thing = db.query(CanvasThing).filter(CanvasThing.id == target_id).first()
        if thing:
            print(f"FOUND: {thing.title} (Type: {thing.type})")
        else:
            print("NOT FOUND.")
            
        print("\nAll Things:")
        all_things = db.query(CanvasThing).all()
        for t in all_things:
            print(f" - {t.title} ({t.id}) [{t.type}]")
            
    finally:
        db.close()

if __name__ == "__main__":
    check_db()
