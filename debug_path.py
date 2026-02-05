
import os
import sqlite3

def test_path():
    print(f"Current Working Directory: {os.getcwd()}")
    
    target_path = os.path.join("backend/chroma_db", "chroma.sqlite3")
    abs_path = os.path.abspath(target_path)
    print(f"Target Path: {target_path}")
    print(f"Absolute Path: {abs_path}")
    print(f"Exists: {os.path.exists(target_path)}")
    
    # Try alternative paths
    alt_path = "chroma_db/chroma.sqlite3"
    print(f"Alt Path ({alt_path}) Exists: {os.path.exists(alt_path)}")
    
    backend_alt = "backend/chroma_db/chroma.sqlite3"
    print(f"Backend Alt ({backend_alt}) Exists: {os.path.exists(backend_alt)}")

    # Try connection if found
    if os.path.exists(target_path):
        try:
             conn = sqlite3.connect(target_path)
             cursor = conn.cursor()
             cursor.execute("SELECT COUNT(*) FROM embeddings")
             print(f"Count via {target_path}: {cursor.fetchone()[0]}")
             conn.close()
        except Exception as e:
            print(f"Connection Error: {e}")

if __name__ == "__main__":
    test_path()
