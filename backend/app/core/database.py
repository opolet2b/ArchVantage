from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
import os

# Create db directory for database (separate from data/ for RAG files)
if not os.path.exists("db"):
    os.makedirs("db")

# Create data directory for uploads and RAG files
if not os.path.exists("data"):
    os.makedirs("data")

from app.core.config import settings

SQLALCHEMY_DATABASE_URL = settings.DATABASE_URL

# Connect args (needed for SQLite)
connect_args = {}
if SQLALCHEMY_DATABASE_URL.startswith("sqlite"):
    connect_args = {
        "check_same_thread": False,
        "timeout": 30
    }

engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args=connect_args,
    pool_pre_ping=True,  # Verify connections before use
    pool_recycle=3600,  # Recycle connections after 1 hour
    pool_size=20,        # Increase pool size to 20 (default 5)
    max_overflow=20      # Increase max overflow to 20 (default 10)
)

def get_db_path():
    """Extract file path from SQLite URL for direct connections."""
    if SQLALCHEMY_DATABASE_URL.startswith("sqlite:///"):
        # Remove sqlite:/// prefix
        return SQLALCHEMY_DATABASE_URL.replace("sqlite:///", "")
    return None
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
