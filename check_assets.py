
from sqlalchemy import create_engine, text
import os

# Database path is relative to backend/
DB_URL = "sqlite:///backend/db/sql_app.db"

engine = create_engine(DB_URL)
with engine.connect() as conn:
    # Use index-based access to be safe across SQLAlchemy versions
    result = conn.execute(text("SELECT id, original_name, mime_type, file_path FROM assets ORDER BY created_at DESC LIMIT 5"))
    rows = result.fetchall()
    print("--- ASSET CHECK ---")
    for row in rows:
        print(f"ID: {row[0]}")
        print(f"  Name: {row[1]}")
        print(f"  MIME: {row[2]}")
        print(f"  Path: {row[3]}")
    print("--- END CHECK ---")
