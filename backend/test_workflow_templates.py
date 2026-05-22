"""
Unit tests for the visual workflow template API router endpoints.
Covers creating, reading, updating (PUT), and deleting workflow templates.
Adheres to PEP 8 standards and is properly commented.
"""

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.core.database import Base, get_db
from main import app
from app.models.user import User, AuthType
from app.routers.auth import get_current_active_user

# Setup isolated SQLite test database
SQLALCHEMY_DATABASE_URL = "sqlite:///./test_workflow_templates.db"
engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False}
)
TestingSessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine
)

# Recreate visual schema mapping on test DB
Base.metadata.create_all(bind=engine)


def override_get_db():
    """Provides isolated DB session context for mock runs."""
    try:
        db = TestingSessionLocal()
        yield db
    finally:
        db.close()


def override_get_current_active_user():
    """Provides standard mock active user authorization context."""
    return User(
        id=1,
        email="test_workflow@example.com",
        is_active=True,
        auth_type=AuthType.INTERNAL
    )


# Override dependencies in standard FastAPI app router
app.dependency_overrides[get_db] = override_get_db
app.dependency_overrides[get_current_active_user] = override_get_current_active_user

client = TestClient(app)


def test_workflow_template_lifecycle():
    """
    Test suite for workflow templates lifecycle:
    1. Creates a new workflow template blueprint.
    2. Reads the templates lists.
    3. Updates (PUT) the existing template with new metadata and bpmn structure.
    4. Deletes the workflow template and verifies cleanup.
    """
    print("Starting Workflow Templates Integration Tests...")

    # Define initial template layout
    initial_payload = {
        "name": "Initial Test Workflow",
        "description": "Initial description of test template",
        "bpmn_json": {
            "nodes": [
                {"id": "node_1", "type": "start", "data": {"label": "Start"}}
            ],
            "edges": []
        }
    }

    # 1. Create template
    create_response = client.post(
        "/api/v1/workflows/templates",
        json=initial_payload
    )
    assert create_response.status_code == 200, f"Create failed: {create_response.text}"
    created_data = create_response.json()
    template_id = created_data["id"]
    assert created_data["name"] == "Initial Test Workflow"
    print("1. Create template: PASSED")

    # 2. Read templates
    read_response = client.get("/api/v1/workflows/templates")
    assert read_response.status_code == 200, f"Read failed: {read_response.text}"
    templates_list = read_response.json()
    assert len(templates_list) > 0
    # Search for our created template
    matching_template = next(
        (t for t in templates_list if t["id"] == template_id),
        None
    )
    assert matching_template is not None
    print("2. Read templates list: PASSED")

    # 3. Update template (PUT) - Tests our new endpoint
    updated_payload = {
        "name": "Updated Test Workflow",
        "description": "Updated description",
        "bpmn_json": {
            "nodes": [
                {"id": "node_1", "type": "start", "data": {"label": "Start"}},
                {"id": "node_2", "type": "task", "data": {"label": "Task"}}
            ],
            "edges": [
                {"source": "node_1", "target": "node_2"}
            ]
        }
    }
    update_response = client.put(
        f"/api/v1/workflows/templates/{template_id}",
        json=updated_payload
    )
    assert update_response.status_code == 200, f"Update failed: {update_response.text}"
    updated_data = update_response.json()
    assert updated_data["id"] == template_id
    assert updated_data["name"] == "Updated Test Workflow"
    assert updated_data["description"] == "Updated description"
    assert len(updated_data["bpmn_json"]["nodes"]) == 2
    print("3. Update template (PUT): PASSED")

    # 4. Delete template
    delete_response = client.delete(
        f"/api/v1/workflows/templates/{template_id}"
    )
    assert delete_response.status_code == 204
    print("4. Delete template: PASSED")

    # Verify template is completely deleted
    get_deleted_response = client.get(
        f"/api/v1/workflows/templates/{template_id}"
    )
    assert get_deleted_response.status_code == 404
    print("Lifecycle verification complete: ALL PASSED")


if __name__ == "__main__":
    try:
        test_workflow_template_lifecycle()
        print("All tests completed successfully.")
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise e
