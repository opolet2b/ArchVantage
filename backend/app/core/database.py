from sqlalchemy import create_engine, event
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
import os

from app.core.config import settings

# Create db directory for database (separate from data/ for RAG files)
db_dir = os.path.join(settings.BASE_DIR, "db")
if not os.path.exists(db_dir):
    os.makedirs(db_dir)

# Create data directory for uploads and RAG files
data_dir = os.path.join(settings.BASE_DIR, "data")
if not os.path.exists(data_dir):
    os.makedirs(data_dir)

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

if SQLALCHEMY_DATABASE_URL.startswith("sqlite"):
    @event.listens_for(engine, "connect")
    def set_sqlite_pragma(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA synchronous=NORMAL")
        cursor.execute("PRAGMA busy_timeout=30000")
        cursor.close()

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
