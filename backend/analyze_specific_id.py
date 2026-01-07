
import os
import sys
# Ensure backend is in path
sys.path.append(os.getcwd())

from app.core.database import SessionLocal
from app.models.canvas_models import CanvasThing
from app.models.asset_models import Asset
from app.models.user import User
from app.services.asset_service import asset_service
import pypdf

TARGET_ID = "428a6155-ce96-4674-ba62-fc1530934ce3"

def analyze():
    db = SessionLocal()
    try:
        print(f"--- Analyzing Target ID: {TARGET_ID} ---")
        
        # 1. Try to find as CanvasThing
        thing = db.query(CanvasThing).filter(CanvasThing.id == TARGET_ID).first()
        if thing:
            print(f"DTO Found in CanvasThing table.")
            print(f"  Title: {thing.title}")
            print(f"  Type: {thing.type.value}")
            content = thing.content or {}
            print(f"  Content Keys: {content.keys()}")
            
            asset_id = content.get("asset_id")
            if asset_id:
                analyze_asset(db, asset_id)
            else:
                print("  No asset_id in thing content.")
        else:
            print("ID not found in CanvasThing. Checking Asset table directly...")
            # It might be an Asset ID directly if the user read it from a specific log context
            analyze_asset(db, TARGET_ID)

    finally:
        db.close()

def analyze_asset(db, asset_id):
    asset = db.query(Asset).filter(Asset.id == asset_id).first()
    if asset:
        print(f"DTO Found in Asset table (ID: {asset.id})")
        print(f"  Original Name: {asset.original_name}")
        print(f"  Mime Type: {asset.mime_type}")
        print(f"  File Path (DB): {asset.file_path}")
        
        real_path = asset_service.get_storage_path(asset)
        print(f"  Resolved Absolute Path: {real_path}")
        
        if real_path and os.path.exists(real_path):
            print("  [Physical File Analysis]")
            file_size = os.path.getsize(real_path)
            print(f"  Size: {file_size} bytes")
            
            try:
                reader = pypdf.PdfReader(real_path)
                print(f"  Is Encrypted: {reader.is_encrypted}")
                print(f"  Page Count: {len(reader.pages)}")
                if len(reader.pages) > 0:
                    page1_text = reader.pages[0].extract_text()
                    print(f"  Page 1 Text Length: {len(page1_text)}")
                    print(f"  Page 1 Full Text Sample:\n{page1_text[:1000]!r}")
            except Exception as e:
                print(f"  pypdf Error: {e}")
        else:
            print("  !!! File does not exist on disk!")
    else:
        print(f"ID {asset_id} not found in Asset table either.")

if __name__ == "__main__":
    analyze()
