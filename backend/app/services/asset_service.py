"""
Asset Service

Handles business logic for file assets:
- Physical storage on disk
- Database record creation
- Access verification

PEP 8 Compliant
"""
import os
import shutil
from datetime import datetime
from pathlib import Path
from typing import Optional
from fastapi import UploadFile, HTTPException, status
from sqlalchemy.orm import Session

from app.models.asset_models import Asset


# Configuration
# Store files in 'data_storage' directory within the backend
STORAGE_ROOT = Path("data_storage")


class AssetService:
    @staticmethod
    def ensure_storage_dir():
        """Ensure storage directory exists."""
        if not STORAGE_ROOT.exists():
            STORAGE_ROOT.mkdir(parents=True, exist_ok=True)

    @staticmethod
    def get_storage_path(asset: Asset) -> Path:
        """Get absolute path for an asset."""
        return STORAGE_ROOT / asset.file_path

    @staticmethod
    def calculate_file_hash(file_path: Path) -> str:
        """Calculate SHA256 hash of a file."""
        import hashlib
        sha256_hash = hashlib.sha256()
        with open(file_path, "rb") as f:
            # Read and update hash string value in blocks of 4K
            for byte_block in iter(lambda: f.read(4096), b""):
                sha256_hash.update(byte_block)
        return sha256_hash.hexdigest()

    @staticmethod
    async def create_asset(
        db: Session,
        file: UploadFile,
        user_id: int
    ) -> tuple[Asset, str]:
        """
        Save an uploaded file and create an asset record.
        Returns (Asset, file_hash).
        """
        print(f"[AssetService] Starting creation for {file.filename}")
        AssetService.ensure_storage_dir()
        
        # 1. Generate secure physical path
        today = datetime.now()
        date_path = Path(f"{today.year}/{today.month:02d}/{today.day:02d}")
        
        full_dir = STORAGE_ROOT / date_path
        full_dir.mkdir(parents=True, exist_ok=True)
        
        import uuid
        import hashlib
        
        file_uuid = str(uuid.uuid4())
        safe_filename = "".join(x for x in file.filename if x.isalnum() or x in "._- ") if file.filename else "file"
        disk_filename = f"{file_uuid}_{safe_filename}"
        
        relative_path = str(date_path / disk_filename)
        destination_path = full_dir / disk_filename
        
        print(f"[AssetService] Writing to {destination_path}")

        # 2. Stream content to disk (Async) AND Compute Hash
        sha256_hash = hashlib.sha256()
        
        try:
            # We use standard open() but write chunks from await file.read()
            with open(destination_path, "wb") as buffer:
                while True:
                    chunk = await file.read(1024 * 1024) # 1MB chunks
                    if not chunk:
                        break
                    buffer.write(chunk)
                    sha256_hash.update(chunk)
            print(f"[AssetService] File write complete")
        except Exception as e:
            print(f"[AssetService] Write failed: {e}")
            if destination_path.exists():
                destination_path.unlink()
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to save file: {str(e)}"
            )
            
        # 3. Create DB Record
        print(f"[AssetService] Creating DB record")
        file_size = destination_path.stat().st_size
        file_hash = sha256_hash.hexdigest()
        
        new_asset = Asset(
            owner_id=user_id,
            original_name=file.filename or "unknown",
            mime_type=file.content_type or "application/octet-stream",
            size_bytes=file_size,
            file_path=relative_path
        )
        
        db.add(new_asset)
        try:
            db.commit()
            db.refresh(new_asset)
            print(f"[AssetService] Asset created: {new_asset.id} (Hash: {file_hash[:8]}...)")
        except Exception as e:
            print(f"[AssetService] DB Commit failed: {e}")
            db.rollback()
            raise e
        
        return new_asset, file_hash

    @staticmethod
    def create_asset_from_bytes(
        db: Session,
        content: bytes,
        filename: str,
        content_type: str,
        user_id: int
    ) -> tuple[Asset, str]:
        """
        Create an asset record from bytes (useful for scrapers downloading files).
        Returns (Asset, file_hash).
        """
        print(f"[AssetService] Creating asset from bytes: {filename}")
        AssetService.ensure_storage_dir()
        
        # 1. Generate secure physical path
        today = datetime.now()
        date_path = Path(f"{today.year}/{today.month:02d}/{today.day:02d}")
        
        full_dir = STORAGE_ROOT / date_path
        full_dir.mkdir(parents=True, exist_ok=True)
        
        import uuid
        import hashlib
        
        file_uuid = str(uuid.uuid4())
        safe_filename = "".join(x for x in filename if x.isalnum() or x in "._- ") if filename else "file"
        disk_filename = f"{file_uuid}_{safe_filename}"
        
        relative_path = str(date_path / disk_filename)
        destination_path = full_dir / disk_filename
        
        # 2. Write content to disk and Compute Hash
        sha256_hash = hashlib.sha256()
        try:
            with open(destination_path, "wb") as buffer:
                buffer.write(content)
                sha256_hash.update(content)
        except Exception as e:
            print(f"[AssetService] Byte write failed: {e}")
            if destination_path.exists():
                destination_path.unlink()
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to save file: {str(e)}"
            )
            
        # 3. Create DB Record
        file_size = len(content)
        file_hash = sha256_hash.hexdigest()
        
        new_asset = Asset(
            owner_id=user_id,
            original_name=filename or "scraped_file",
            mime_type=content_type or "application/octet-stream",
            size_bytes=file_size,
            file_path=relative_path
        )
        
        db.add(new_asset)
        try:
            db.commit()
            db.refresh(new_asset)
            print(f"[AssetService] Byte Asset created: {new_asset.id} (Hash: {file_hash[:8]}...)")
        except Exception as e:
            db.rollback()
            raise e
        
        return new_asset, file_hash

    @staticmethod
    def get_asset_stream(
        db: Session,
        asset_id: str,
        user_id: int
    ) -> tuple[Path, str, str]:
        """
        Verify access and return path/metadata for streaming.
        """
        asset = db.query(Asset).filter(Asset.id == asset_id).first()
        
        if not asset:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Asset not found"
            )
            
        # Access control
        if asset.owner_id != user_id:
            # We return 404 to avoid leaking existence of other users' files
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Asset not found"
            )
            
        file_path = STORAGE_ROOT / asset.file_path
        
        if not file_path.exists():
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Physical file missing"
            )
            
        return file_path, asset.mime_type, asset.original_name

    @staticmethod
    def delete_asset(
        db: Session,
        asset_id: str,
        user_id: int
    ) -> bool:
        """
        Delete an asset and its physical file.
        """
        asset = db.query(Asset).filter(Asset.id == asset_id).first()
        
        if not asset:
            # Already gone or not found
            return False
            
        if asset.owner_id != user_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not authorized to delete this asset"
            )
            
        # 1. Delete physical file
        file_path = STORAGE_ROOT / asset.file_path
        if file_path.exists():
            try:
                file_path.unlink()
                print(f"[AssetService] Deleted file: {file_path}")
            except Exception as e:
                print(f"[AssetService] Error deleting file {file_path}: {e}")
                
        # 2. Delete Sidecar JSON if exists (for PPTX etc)
        sidecar_path = Path(str(file_path) + ".json")
        if sidecar_path.exists():
            try:
                sidecar_path.unlink()
                print(f"[AssetService] Deleted sidecar: {sidecar_path}")
            except Exception as e:
                print(f"[AssetService] Error deleting sidecar {sidecar_path}: {e}")
                
        # 3. Delete DB Record
        db.delete(asset)
        try:
            db.commit()
            print(f"[AssetService] Deleted asset record: {asset_id}")
            return True
        except Exception as e:
            db.rollback()
            print(f"[AssetService] Error deleting asset DB record: {e}")
            raise e

asset_service = AssetService()
