
import shutil
import time
import os
import sys

def monitor_space(threshold_gb=5):
    db_path = "backend/chroma_db/chroma.sqlite3"
    journal_path = db_path + "-journal"
    wal_path = db_path + "-wal"
    
    print(f"Monitoring disk space for DB: {db_path}")
    print("Press Ctrl+C to stop monitoring (this won't stop the purge).")
    
    while True:
        total, used, free = shutil.disk_usage(".")
        free_gb = free / (1024**3)
        
        journal_size = 0
        if os.path.exists(journal_path):
            journal_size = os.path.getsize(journal_path) / (1024**3)
            
        wal_size = 0
        if os.path.exists(wal_path):
            wal_size = os.path.getsize(wal_path) / (1024**3)
            
        sys.stdout.write(f"\rFree Space: {free_gb:.2f} GB | Journal: {journal_size:.2f} GB | WAL: {wal_size:.2f} GB   ")
        sys.stdout.flush()
        
        if free_gb < threshold_gb:
            print(f"\n\nWARNING: Low disk space! ({free_gb:.2f} GB remaining)")
            print("Recommendation: If completely out of space, the OS will kill the process.")
            break
            
        time.sleep(2)

if __name__ == "__main__":
    monitor_space()
