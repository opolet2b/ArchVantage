
import sys
import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.core.config import settings
from app.models.smart_template import SmartRenderingType

def debug_rendering_types():
    db_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "db", "sql_app.db")
    settings.DATABASE_URL = f"sqlite:///{db_path}"
    
    engine = create_engine(settings.DATABASE_URL, connect_args={"check_same_thread": False})
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    db = SessionLocal()

    try:
        types = db.query(SmartRenderingType).all()
        for t in types:
            print(f"ID: {t.id} || Name: {t.name} || Category: {t.category}")
            
        print("\n--- Output Formats ---")
        from app.models.smart_template import SmartOutputFormat
        formats = db.query(SmartOutputFormat).all()
        for f in formats:
            print(f"ID: {f.id} || Name: {f.name} || Type: {f.type} || Ext: {f.extension}")
    finally:
        db.close()

if __name__ == "__main__":
    debug_rendering_types()
