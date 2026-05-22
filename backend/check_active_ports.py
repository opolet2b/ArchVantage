import socket

def is_port_open(port):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(1.0)
        return s.connect_ex(('127.0.0.1', port)) == 0

print("Port 8000 (Backend):", "OPEN" if is_port_open(8000) else "CLOSED")
print("Port 3000 (Frontend):", "OPEN" if is_port_open(3000) else "CLOSED")
