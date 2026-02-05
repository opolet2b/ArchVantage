
import sqlite3
import os
import time

def force_shrink():
    # Reliable path discovery
    current_dir = os.path.dirname(os.path.abspath(__file__))
    # Assuming this script is in project root
    chroma_db_path = os.path.join(current_dir, "backend", "chroma_db", "chroma.sqlite3")
    
    print(f"Target Database: {chroma_db_path}")
    if not os.path.exists(chroma_db_path):
        print("Error: Database not found.")
        return

    initial_size = os.path.getsize(chroma_db_path) / (1024*1024*1024)
    print(f"Current Size: {initial_size:.2f} GB")
    print("Starting FORCE VACUUM. Please do not interrupt...")
    print("(This creates a copy of the database, so it requires ~200MB free space)")
    
    start_time = time.time()
    
    try:
        conn = sqlite3.connect(chroma_db_path)
        # WAL mode is often faster for vacuuming as it doesn't lock readers as aggressively
        # but we want a full rewrite.
        conn.execute("VACUUM") 
        conn.close()
        
        end_time = time.time()
        final_size = os.path.getsize(chroma_db_path) / (1024*1024)
        
        print(f"\nSUCCESS! Vacuum completed in {end_time - start_time:.1f} seconds.")
        print(f"Old Size: {initial_size:.2f} GB")
        print(f"New Size: {final_size:.2f} MB")
        
    except sqlite3.OperationalError as e:
        print(f"\nError: {e}")
        if "locked" in str(e):
            print("The database is locked. Please STOP the backend server and any other scripts.")

if __name__ == "__main__":
    force_shrink()
