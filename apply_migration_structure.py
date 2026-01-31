
import sys
import os
from sqlalchemy import create_engine, text, inspect

# Add backend to path
sys.path.append(os.path.join(os.getcwd(), 'backend'))

try:
    from app.core.config import settings
except ImportError:
    # Try importing directly if inside backend
    sys.path.append(os.path.join(os.getcwd(), 'backend', 'app'))
    from app.core.config import settings

def migrate():
    # Detect the correct DB file if using SQLite default
    if "sqlite" in settings.DATABASE_URL and "sql_app.db" in settings.DATABASE_URL:
        # Check backend/db/sql_app.db
        backend_db = os.path.join(os.getcwd(), 'backend', 'db', 'sql_app.db')
        if os.path.exists(backend_db):
            print(f"Found database at: {backend_db}")
            settings.DATABASE_URL = f"sqlite:///{backend_db}"
        else:
             print(f"Warning: backend/db/sql_app.db not found. Using configured: {settings.DATABASE_URL}")

    print(f"Connecting to database: {settings.DATABASE_URL}")
    engine = create_engine(settings.DATABASE_URL)
    
    inspector = inspect(engine)
    columns = [c['name'] for c in inspector.get_columns('templates')]
    
    if 'structure' not in columns:
        print("Column 'structure' not found in 'templates' table. Adding it...")
        with engine.connect() as conn:
            # SQLite syntax? Postgres?
            # settings.DATABASE_URL usually tells.
            # Assuming Postgres or SQLite.
            # SQLite doesn't support ALTER TABLE ADD COLUMN JSON directly in older versions?
            # Actually SQLite supports ADD COLUMN.
            # JSON type in Postgres is JSON. In SQLite it's just TEXT usually or JSON if extension enabled.
            # SQL Alchemy handles type mapping but for raw SQL we need to be careful.
            
            is_sqlite = 'sqlite' in settings.DATABASE_URL
            
            if is_sqlite:
                # SQLite doesn't strictly have JSON type, usage TEXT or JSON
                conn.execute(text("ALTER TABLE templates ADD COLUMN structure JSON"))
            else:
                # Postgres
                conn.execute(text("ALTER TABLE templates ADD COLUMN structure JSON"))
            
            conn.commit()
        print("Column 'structure' added successfully.")
    else:
        print("Column 'structure' already exists.")

if __name__ == "__main__":
    try:
        migrate()
    except Exception as e:
        print(f"Migration failed: {e}")
