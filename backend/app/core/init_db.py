from sqlalchemy.orm import Session
from sqlalchemy import text
from app.models.user import Role, User, AuthType, UserRole, UserRoleSource
from app.core.security import get_password_hash
from app.core.database import SessionLocal, engine


def run_migrations(db: Session) -> None:
    """
    Run schema migrations for SQLite.
    
    Adds missing columns to existing tables.
    """
    # Check if tools table exists first
    try:
        result = db.execute(
            text("SELECT name FROM sqlite_master WHERE type='table' AND name='tools'")
        )
        table_exists = result.fetchone() is not None
        result.close()
        
        if not table_exists:
            # Table doesn't exist yet, will be created by SQLAlchemy
            print("Tools table does not exist yet, skipping migration.")
            return
        
        # Check if tool_type column exists in tools table
        result = db.execute(
            text("SELECT tool_type FROM tools LIMIT 1")
        )
        result.close()
        print("Migration check: tool_type column already exists.")
    except Exception as e:
        # Column doesn't exist, add it
        print(f"Adding 'tool_type' column to tools table... (reason: {e})")
        try:
            db.execute(
                text("ALTER TABLE tools ADD COLUMN tool_type VARCHAR(10) DEFAULT 'mcp'")
            )
            db.commit()
            print("Added 'tool_type' column successfully.")
        except Exception as alter_error:
            print(f"Warning: Could not add tool_type column: {alter_error}")
            db.rollback()

def init_db(db: Session) -> None:
    # 1. Create Default Roles
    roles = ["Admin", "User"]
    for role_name in roles:
        role = db.query(Role).filter(Role.name == role_name).first()
        if not role:
            role = Role(name=role_name, description=f"Default {role_name} role")
            db.add(role)
            db.commit()
            print(f"Created role: {role_name}")

    # 2. Create Default Admin User
    admin_email = "admin@example.com"
    admin_user = db.query(User).filter(User.email == admin_email).first()
    if not admin_user:
        admin_user = User(
            email=admin_email,
            first_name="Admin",
            last_name="User",
            # password_hash=get_password_hash("admin123"), 
            auth_type=AuthType.INTERNAL,
            is_active=True
        )
        print(f"Hashing password: 'admin123' (len={len('admin123')})")
        admin_user.password_hash = get_password_hash("admin123")
        
        db.add(admin_user)
        db.commit()
        db.refresh(admin_user)
        print(f"Created admin user: {admin_email}")
        
        # Assign Admin role
        admin_role = db.query(Role).filter(Role.name == "Admin").first()
        if admin_role:
            user_role = UserRole(user_id=admin_user.id, role_id=admin_role.id, source=UserRoleSource.MANUAL)
            db.add(user_role)
            db.commit()
            print(f"Assigned Admin role to {admin_email}")

if __name__ == "__main__":
    db = SessionLocal()
    init_db(db)
