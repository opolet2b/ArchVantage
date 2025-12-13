import requests

BASE_URL = "http://localhost:8000/api/v1"

def test_auth_flow():
    print("Testing Auth Flow...")
    
    # 1. Login as Admin
    print("1. Logging in as Admin...")
    login_data = {
        "username": "admin@example.com",
        "password": "admin123"
    }
    response = requests.post(f"{BASE_URL}/auth/token", data=login_data)
    if response.status_code != 200:
        print(f"Login failed: {response.text}")
        return False
    
    token = response.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    print("Login successful.")

    # 2. Get Current User
    print("2. Getting current user...")
    response = requests.get(f"{BASE_URL}/auth/me", headers=headers)
    if response.status_code != 200:
        print(f"Get me failed: {response.text}")
        return False
    print(f"Current user: {response.json()}")

    # 3. List Users (Admin only)
    print("3. Listing users...")
    response = requests.get(f"{BASE_URL}/users", headers=headers)
    if response.status_code != 200:
        print(f"List users failed: {response.text}")
        return False
    users = response.json()
    print(f"Found {len(users)} users.")

    # 4. Create New User
    print("4. Creating new user...")
    new_user = {
        "email": "testuser@example.com",
        "password": "password123",
        "first_name": "Test",
        "last_name": "User",
        "is_active": True,
        "role_ids": []
    }
    # Check if exists first to avoid error
    exists = any(u['email'] == new_user['email'] for u in users)
    if not exists:
        response = requests.post(f"{BASE_URL}/users", json=new_user, headers=headers)
        if response.status_code != 200:
            print(f"Create user failed: {response.text}")
            return False
        print("User created.")
    else:
        print("User already exists, skipping creation.")

    print("Auth Flow Test Passed!")
    return True

if __name__ == "__main__":
    try:
        test_auth_flow()
    except Exception as e:
        print(f"Test failed with exception: {e}")
