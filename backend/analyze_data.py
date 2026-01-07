
import os
import sys
# Ensure backend is in path
sys.path.append(os.getcwd())

from app.core.database import SessionLocal
from app.models.canvas_models import CanvasThing, ThingType
from app.models.asset_models import Asset
from app.models.user import User # Fix relationship lookup
from app.services.asset_service import asset_service
import pypdf

def analyze():
    db = SessionLocal()
    try:
        print("--- Analyzing CanvasThings ---")
        # Find things that look like our PDF
        things = db.query(CanvasThing).filter(CanvasThing.title.ilike("%Test_Scan%")).all()
        for t in things:
            print(f"Thing ID: {t.id}")
            print(f"  Title: {t.title}")
            print(f"  Type: {t.type.value} (Enum: {t.type})")
            print(f"  Content Keys: {t.content.keys() if t.content else 'None'}")
            if t.content:
                print(f"  Content 'file_path': {t.content.get('file_path')}")
                print(f"  Content 'asset_id': {t.content.get('asset_id')}")
                print(f"  Content 'mime_type': {t.content.get('mime_type')}") # Check if this exists

            # Check Asset if linked
            asset_id = t.content.get("asset_id")
            if asset_id:
                asset = db.query(Asset).filter(Asset.id == asset_id).first()
                if asset:
                    print(f"  -> Linked Asset ID: {asset.id}")
                    print(f"     Original Name: {asset.original_name}")
                    print(f"     Mime Type: {asset.mime_type}")
                    print(f"     File Path (DB): {asset.file_path}")
                    
                    real_path = asset_service.get_storage_path(asset)
                    print(f"     Resolved Absolute Path: {real_path}")
                    
                    if real_path and os.path.exists(real_path):
                        print("     [Physical File Analysis]")
                        file_size = os.path.getsize(real_path)
                        print(f"     Size: {file_size} bytes")
                        
                        try:
                            reader = pypdf.PdfReader(real_path)
                            print(f"     Is Encrypted: {reader.is_encrypted}")
                            print(f"     Page Count: {len(reader.pages)}")
                            if len(reader.pages) > 0:
                                page1_text = reader.pages[0].extract_text()
                                print(f"     Page 1 Text Length: {len(page1_text)}")
                                print(f"     Page 1 Text Snippet: {page1_text[:100]!r}")
                        except Exception as e:
                            print(f"     pypdf Error: {e}")
                    else:
                        print("     !!! File does not exist on disk!")
                else:
                    print("  !!! Asset ID not found in Asset table.")
            else:
                print("  No asset_id in content.")
            print("-" * 30)
            
    finally:
        db.close()

if __name__ == "__main__":
    analyze()
