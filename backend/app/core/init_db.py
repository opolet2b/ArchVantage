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

    # Migration for canvas_things iconified columns
    try:
        result = db.execute(
            text("SELECT name FROM sqlite_master WHERE type='table' AND name='canvas_things'")
        )
        table_exists = result.fetchone() is not None
        result.close()
        
        if table_exists:
            # Check if iconified column exists
            try:
                result = db.execute(
                    text("SELECT iconified FROM canvas_things LIMIT 1")
                )
                result.close()
                print("Migration check: iconified column already exists.")
            except Exception:
                # Add iconified column
                print("Adding 'iconified' column to canvas_things table...")
                try:
                    db.execute(
                        text("ALTER TABLE canvas_things ADD COLUMN iconified BOOLEAN DEFAULT 0")
                    )
                    db.commit()
                    print("Added 'iconified' column successfully.")
                except Exception as alter_error:
                    print(f"Warning: Could not add iconified column: {alter_error}")
                    db.rollback()
            
            # Check if pre_iconify_size column exists
            try:
                result = db.execute(
                    text("SELECT pre_iconify_size FROM canvas_things LIMIT 1")
                )
                result.close()
                print("Migration check: pre_iconify_size column already exists.")
            except Exception:
                # Add pre_iconify_size column
                print("Adding 'pre_iconify_size' column to canvas_things table...")
                try:
                    db.execute(
                        text("ALTER TABLE canvas_things ADD COLUMN pre_iconify_size JSON")
                    )
                    db.commit()
                    print("Added 'pre_iconify_size' column successfully.")
                except Exception as alter_error:
                    print(f"Warning: Could not add pre_iconify_size column: {alter_error}")
                    db.rollback()
                    print(f"Warning: Could not add pre_iconify_size column: {alter_error}")
                    db.rollback()

            # Check if rag_status column exists
            try:
                result = db.execute(
                    text("SELECT rag_status FROM canvas_things LIMIT 1")
                )
                result.close()
                print("Migration check: rag_status column already exists.")
            except Exception:
                # Add rag_status column
                print("Adding 'rag_status' column to canvas_things table...")
                try:
                    db.execute(
                        text("ALTER TABLE canvas_things ADD COLUMN rag_status VARCHAR(20) DEFAULT 'none'")
                    )
                    db.commit()
                    print("Added 'rag_status' column successfully.")
                except Exception as alter_error:
                    print(f"Warning: Could not add rag_status column: {alter_error}")
                    db.rollback()
    except Exception as e:
        print(f"Canvas_things migration check failed: {e}")

    # Migration for smart_analysis_templates activity_type
    try:
        result = db.execute(
            text("SELECT name FROM sqlite_master WHERE type='table' AND name='smart_analysis_templates'")
        )
        table_exists = result.fetchone() is not None
        result.close()

        if table_exists:
            try:
                result = db.execute(
                    text("SELECT activity_type FROM smart_analysis_templates LIMIT 1")
                )
                result.close()
                print("Migration check: activity_type column already exists in smart_analysis_templates.")
            except Exception:
                print("Adding 'activity_type' column to smart_analysis_templates table...")
                try:
                    db.execute(
                        text("ALTER TABLE smart_analysis_templates ADD COLUMN activity_type VARCHAR NOT NULL DEFAULT 'General'")
                    )
                    db.commit()
                    print("Added 'activity_type' column successfully.")
                except Exception as alter_error:
                    print(f"Warning: Could not add activity_type column: {alter_error}")
                    db.rollback()
    except Exception as e:
        print(f"smart_analysis_templates migration check failed: {e}")

    # Migration for canvas_things color column
    try:
        result = db.execute(
            text("SELECT name FROM sqlite_master WHERE type='table' AND name='canvas_things'")
        )
        table_exists = result.fetchone() is not None
        result.close()
        
        if table_exists:
            try:
                result = db.execute(
                    text("SELECT color FROM canvas_things LIMIT 1")
                )
                result.close()
                print("Migration check: color column already exists in canvas_things.")
            except Exception:
                print("Adding 'color' column to canvas_things table...")
                try:
                    db.execute(
                        text("ALTER TABLE canvas_things ADD COLUMN color VARCHAR(20)")
                    )
                    db.commit()
                    print("Added 'color' column successfully.")
                except Exception as alter_error:
                    print(f"Warning: Could not add color column: {alter_error}")
                    db.rollback()
    except Exception as e:
        print(f"canvas_things color migration check failed: {e}")

    # Migration for canvases is_archived
    try:
        result = db.execute(
            text("SELECT name FROM sqlite_master WHERE type='table' AND name='canvases'")
        )
        table_exists = result.fetchone() is not None
        result.close()

        if table_exists:
            try:
                result = db.execute(
                    text("SELECT is_archived FROM canvases LIMIT 1")
                )
                result.close()
                print("Migration check: is_archived column already exists in canvases.")
            except Exception:
                print("Adding 'is_archived' column to canvases table...")
                try:
                    db.execute(
                        text("ALTER TABLE canvases ADD COLUMN is_archived BOOLEAN DEFAULT 0")
                    )
                    db.commit()
                    print("Added 'is_archived' column successfully.")
                except Exception as alter_error:
                    print(f"Warning: Could not add is_archived column: {alter_error}")
                    db.rollback()
    except Exception as e:
        print(f"canvases migration check failed: {e}")

    # Migration for canvases owner_config
    try:
        result = db.execute(
            text("SELECT name FROM sqlite_master WHERE type='table' AND name='canvases'")
        )
        table_exists = result.fetchone() is not None
        result.close()

        if table_exists:
            try:
                result = db.execute(
                    text("SELECT owner_config FROM canvases LIMIT 1")
                )
                result.close()
                print("Migration check: owner_config column already exists in canvases.")
            except Exception:
                print("Adding 'owner_config' column to canvases table...")
                try:
                    db.execute(
                        text("ALTER TABLE canvases ADD COLUMN owner_config JSON")
                    )
                    db.commit()
                    print("Added 'owner_config' column successfully.")
                except Exception as alter_error:
                    print(f"Warning: Could not add owner_config column: {alter_error}")
                    db.rollback()
    except Exception as e:
        print(f"canvases owner_config migration check failed: {e}")

    # Migration for canvases analysis_space_id
    try:
        result = db.execute(
            text("SELECT name FROM sqlite_master WHERE type='table' AND name='canvases'")
        )
        table_exists = result.fetchone() is not None
        result.close()

        if table_exists:
            try:
                result = db.execute(
                    text("SELECT analysis_space_id FROM canvases LIMIT 1")
                )
                result.close()
                print("Migration check: analysis_space_id column already exists in canvases.")
            except Exception:
                print("Adding 'analysis_space_id' column to canvases table...")
                try:
                    db.execute(
                        text("ALTER TABLE canvases ADD COLUMN analysis_space_id VARCHAR(36)")
                    )
                    db.commit()
                    print("Added 'analysis_space_id' column successfully.")
                except Exception as alter_error:
                    print(f"Warning: Could not add analysis_space_id column: {alter_error}")
                    db.rollback()
    except Exception as e:
        print(f"canvases analysis_space_id migration check failed: {e}")

    # Migration for domains scenario fields
    try:
        result = db.execute(
            text("SELECT name FROM sqlite_master WHERE type='table' AND name='domains'")
        )
        table_exists = result.fetchone() is not None
        result.close()

        if table_exists:
            # Check visual_config
            try:
                result = db.execute(
                    text("SELECT visual_config FROM domains LIMIT 1")
                )
                result.close()
                print("Migration check: visual_config column already exists in domains.")
            except Exception:
                print("Adding 'visual_config' column to domains table...")
                try:
                    db.execute(
                        text("ALTER TABLE domains ADD COLUMN visual_config JSON")
                    )
                    db.commit()
                    print("Added 'visual_config' column successfully.")
                except Exception as alter_error:
                    print(f"Warning: Could not add visual_config column: {alter_error}")
                    db.rollback()
            
            # Check metadata_schema
            try:
                result = db.execute(
                    text("SELECT metadata_schema FROM domains LIMIT 1")
                )
                result.close()
                print("Migration check: metadata_schema column already exists in domains.")
            except Exception:
                print("Adding 'metadata_schema' column to domains table...")
                try:
                    db.execute(
                        text("ALTER TABLE domains ADD COLUMN metadata_schema JSON")
                    )
                    db.commit()
                    print("Added 'metadata_schema' column successfully.")
                except Exception as alter_error:
                    print(f"Warning: Could not add metadata_schema column: {alter_error}")
                    db.rollback()

            # Check type (domain definition id)
            try:
                result = db.execute(
                    text("SELECT type FROM domains LIMIT 1")
                )
                result.close()
                print("Migration check: type column already exists in domains.")
            except Exception:
                print("Adding 'type' column to domains table...")
                try:
                    db.execute(
                        text("ALTER TABLE domains ADD COLUMN type VARCHAR(50)")
                    )
                    db.commit()
                    print("Added 'type' column successfully.")
                except Exception as alter_error:
                    print(f"Warning: Could not add type column: {alter_error}")
                    db.rollback()

    except Exception as e:
        print(f"domains migration check failed: {e}")

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
        if admin_role:
            user_role = UserRole(user_id=admin_user.id, role_id=admin_role.id, source=UserRoleSource.MANUAL)
            db.add(user_role)
            db.commit()
            print(f"Assigned Admin role to {admin_email}")

    # 3. Seed System Scenarios
    from app.models.scenario_models import Scenario
    vanilla = db.query(Scenario).filter(Scenario.name == "Vanilla").first()
    if not vanilla:
        print("Seeding 'Vanilla' system scenario...")
        vanilla = Scenario(
            name="Vanilla",
            description="Standard Semantic Canvas without specialized domains.",
            icon="box",
            theme_color="#64748b", # Slate-500
            is_default=True,
            is_system=True,
            created_by_id=admin_user.id if admin_user else None,
            configuration={
                "domain_definitions": [],
                "automations": [],
                "ui_overrides": {}
            }
        )
        db.add(vanilla)
        db.commit()
        print("Created 'Vanilla' scenario.")
    
    # Run Migrations for Scenarios inside init_db if needed (or prefer run_migrations)
    # Ideally should be in run_migrations but imports might be tricky. 
    # Let's rely on run_migrations being called before init_db in main.py

def run_migrations(db: Session) -> None:
    """
    Run schema migrations for SQLite.
    
    Adds missing columns to existing tables.
    """
    # ... (Previous migrations) ...

    # Migration for Scenarios (is_default, is_system)
    try:
        result = db.execute(
            text("SELECT name FROM sqlite_master WHERE type='table' AND name='scenarios'")
        )
        table_exists = result.fetchone() is not None
        result.close()

        if table_exists:
            # Check is_default
            try:
                result = db.execute(text("SELECT is_default FROM scenarios LIMIT 1"))
                result.close()
            except Exception:
                print("Adding 'is_default' column to scenarios table...")
                try:
                    db.execute(text("ALTER TABLE scenarios ADD COLUMN is_default BOOLEAN DEFAULT 0"))
                    db.commit()
                except Exception as e:
                    print(f"Warning: Could not add is_default: {e}")
                    db.rollback()

            # Check is_system
            try:
                result = db.execute(text("SELECT is_system FROM scenarios LIMIT 1"))
                result.close()
            except Exception:
                print("Adding 'is_system' column to scenarios table...")
                try:
                    db.execute(text("ALTER TABLE scenarios ADD COLUMN is_system BOOLEAN DEFAULT 0"))
                    db.commit()
                except Exception as e:
                    print(f"Warning: Could not add is_system: {e}")
                    db.rollback()
    except Exception as e:
        print(f"Scenarios migration check failed: {e}")


if __name__ == "__main__":
    db = SessionLocal()
    run_migrations(db)
    init_db(db)
