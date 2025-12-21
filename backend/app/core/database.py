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

SQLALCHEMY_DATABASE_URL = "sqlite:///./db/sql_app.db"
# For PostgreSQL, use:
# SQLALCHEMY_DATABASE_URL = "postgresql://user:password@postgresserver/db"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={
        "check_same_thread": False,
        "timeout": 30  # SQLite lock timeout in seconds
    },
    pool_pre_ping=True,  # Verify connections before use
    pool_recycle=3600,  # Recycle connections after 1 hour
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
