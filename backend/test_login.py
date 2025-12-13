import requests

# Test login
url = "http://localhost:8000/api/v1/auth/token"
data = {
    "username": "admin@example.com",
    "password": "admin123"
}

print(f"Testing login to: {url}")
print(f"Username: {data['username']}")
print(f"Password: {data['password']}")
print()

try:
    response = requests.post(url, data=data)
    
    print(f"Status Code: {response.status_code}")
    print(f"Response Headers: {dict(response.headers)}")
    print(f"Response Body: {response.text}")
    print()
    
    if response.status_code == 200:
        token_data = response.json()
        print("✓ Login successful!")
        print(f"Access Token: {token_data.get('access_token', 'N/A')[:50]}...")
        print(f"Token Type: {token_data.get('token_type', 'N/A')}")
    else:
        print("✗ Login failed!")
        try:
            error_data = response.json()
            print(f"Error details: {error_data}")
        except:
            pass
            
except Exception as e:
    print(f"✗ Error: {e}")
