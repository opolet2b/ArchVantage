from app.core.database import SessionLocal
from app.models.user import Role
import json

db = SessionLocal()
roles = db.query(Role).all()
print(f"Found {len(roles)} roles.")
for role in roles:
    perms = role.permissions
    # permissions is already a list (JSON type in sqlalchemy model)
    if "VIEW_ANALYTICS" in perms:
        print(f"Role '{role.name}' has VIEW_ANALYTICS permission.")
    else:
        print(f"Role '{role.name}' does NOT have VIEW_ANALYTICS permission.")
