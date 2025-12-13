from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.core.database import Base, get_db
from main import app
from app.models.user import User, AuthType
from app.routers.auth import get_current_active_user

# Setup test database
SQLALCHEMY_DATABASE_URL = "sqlite:///./test.db"
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base.metadata.create_all(bind=engine)

def override_get_db():
    try:
        db = TestingSessionLocal()
        yield db
    finally:
        db.close()

# Mock user
def override_get_current_active_user():
    return User(id=1, email="test@example.com", is_active=True, auth_type=AuthType.INTERNAL)

app.dependency_overrides[get_db] = override_get_db
app.dependency_overrides[get_current_active_user] = override_get_current_active_user

client = TestClient(app)

def test_create_tool():
    response = client.post(
        "/api/v1/tools",
        json={
            "name": "Test Tool",
            "description": "A test tool",
            "is_public": True
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "Test Tool"
    assert data["owner_id"] == 1

def test_read_tools():
    response = client.get("/api/v1/tools")
    assert response.status_code == 200
    data = response.json()
    assert len(data) > 0
    assert data[0]["name"] == "Test Tool"

def test_update_tool():
    # First get the tool id
    response = client.get("/api/v1/tools")
    tool_id = response.json()[0]["id"]
    
    response = client.put(
        f"/api/v1/tools/{tool_id}",
        json={
            "name": "Updated Tool",
            "description": "Updated description"
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "Updated Tool"

def test_delete_tool():
    # First get the tool id
    response = client.get("/api/v1/tools")
    tool_id = response.json()[0]["id"]
    
    response = client.delete(f"/api/v1/tools/{tool_id}")
    assert response.status_code == 200
    
    # Verify it's gone
    response = client.get(f"/api/v1/tools/{tool_id}")
    assert response.status_code == 404

if __name__ == "__main__":
    try:
        test_create_tool()
        print("test_create_tool passed")
        test_read_tools()
        print("test_read_tools passed")
        test_update_tool()
        print("test_update_tool passed")
        test_delete_tool()
        print("test_delete_tool passed")
        print("All tests passed")
    except Exception as e:
        import traceback
        traceback.print_exc()

