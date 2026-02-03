import sys
import os

# Add backend directory to sys.path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.models.user import User, Role
from app.models.canvas_models import Domain, Canvas, CanvasThing, CanvasLink
from app.schemas.canvas_schemas import DomainCreate

def verify_drop_zones():
    print("Verifying Domain Model...")
    try:
        domain = Domain(name="Test Domain", drop_zones=[{"id": "zone1", "label": "Test Zone"}])
        print("Success: Domain model accepted drop_zones.")
    except Exception as e:
        print(f"Error: Domain model failed to accept drop_zones: {e}")
        return

    print("\nVerifying DomainCreate Schema...")
    try:
        schema = DomainCreate(
            name="Test Domain", 
            description="Test Description",
            drop_zones=[{"id": "zone1", "label": "Test Zone"}]
        )
        print("Success: DomainCreate schema validated drop_zones.")
        print(f"Data: {schema.drop_zones}")
    except Exception as e:
        print(f"Error: DomainCreate schema failed validation: {e}")
        return

if __name__ == "__main__":
    verify_drop_zones()
