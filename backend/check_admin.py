from app.core.database import SessionLocal
from app.models.user import User
from app.core.security import verify_password, get_password_hash

db = SessionLocal()

# Check if admin user exists
admin_user = db.query(User).filter(User.email == "admin@example.com").first()

if admin_user:
    print(f"✓ Admin user found:")
    print(f"  Email: {admin_user.email}")
    print(f"  First Name: {admin_user.first_name}")
    print(f"  Last Name: {admin_user.last_name}")
    print(f"  Is Active: {admin_user.is_active}")
    print(f"  Auth Type: {admin_user.auth_type}")
    print(f"  Password Hash: {admin_user.password_hash}")
    print(f"  Roles: {[role.name for role in admin_user.roles]}")
    
    # Test password verification
    print(f"\nTesting password 'admin123':")
    is_valid = verify_password("admin123", admin_user.password_hash)
    print(f"  Password verification result: {is_valid}")
    
    # Generate a new hash for comparison
    new_hash = get_password_hash("admin123")
    print(f"\nNew hash for 'admin123': {new_hash}")
    print(f"Verifying new hash: {verify_password('admin123', new_hash)}")
else:
    print("✗ Admin user NOT found in database")
    
    # List all users
    all_users = db.query(User).all()
    print(f"\nFound {len(all_users)} total users:")
    for user in all_users:
        print(f"  - {user.email} ({user.first_name} {user.last_name})")

db.close()
