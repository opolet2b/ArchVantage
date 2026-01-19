from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.models.smart_template import SmartAnalysisTemplate
from app.core.config import settings

# Adjust database URL to the specific file confirmed by user
DATABASE_URL = "sqlite:///c:/Users/opole/Downloads/ChatBotn/backend/db/sql_app.db"

engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def check_templates():
    db = SessionLocal()
    try:
        templates = db.query(SmartAnalysisTemplate).all()
        print(f"Found {len(templates)} Smart Analysis Templates:")
        for t in templates:
            # Only print fields we know exist or are safe
            print(f"- [{t.id}] {t.name}")
    except Exception as e:
        print(f"Error querying database: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    check_templates()
