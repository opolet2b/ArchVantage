
import sys
import os
import json

# Change to backend directory so that relative file paths (like sqlite DB) work as expected
backend_dir = os.path.join(os.getcwd(), "backend")
if os.path.exists(backend_dir):
    os.chdir(backend_dir)
sys.path.append(os.getcwd())

from app.core.database import SessionLocal
from app.models.user import User # Required for relationships
from app.models.canvas_models import CanvasThing

def cleanup_blobs():
    db = SessionLocal()
    try:
        print("Scanning for stale blob URLs...")
        
        # Fetch all things to check content (JSON search in SQLite is limited, easier to filter in python for this one-off)
        things = db.query(CanvasThing).all()
        
        deleted_count = 0
        
        for thing in things:
            # Check content for "blob:" string
            content_str = json.dumps(thing.content)
            if "blob:http" in content_str:
                print(f"[DELETE] Found stale blob thing: {thing.id} ({thing.type}) - {thing.title}")
                db.delete(thing)
                deleted_count += 1
                
        if deleted_count > 0:
            db.commit()
            print(f"Successfully deleted {deleted_count} stale items.")
        else:
            print("No stale blob items found.")
            
    except Exception as e:
        print(f"Error: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    cleanup_blobs()
