
import os
import time
import shutil

def finish_swap():
    current_dir = os.path.dirname(os.path.abspath(__file__))
    src_db = os.path.join(current_dir, "backend", "chroma_db", "chroma.sqlite3")
    clean_db = os.path.join(current_dir, "backend", "chroma_db", "chroma_clean.sqlite3")
    backup = src_db + ".bak"
    
    print("Finishing swap...")
    
    if os.path.exists(backup):
        print(f"Removing old backup: {backup}")
        try:
            os.remove(backup)
        except Exception as e:
            print(f"Warning: Could not remove backup: {e}")
            
    if os.path.exists(src_db):
        print(f"Backing up original (20GB): {src_db}")
        try:
            os.rename(src_db, backup)
        except Exception as e:
            print(f"Error renaming original: {e}")
            return

    if os.path.exists(clean_db):
        print(f"Activating clean DB (7MB): {clean_db}")
        try:
            os.rename(clean_db, src_db)
            print("SUCCESS! Database swapped.")
        except Exception as e:
             print(f"Error activating new DB: {e}")
             # Rollback
             if os.path.exists(backup):
                 os.rename(backup, src_db)

if __name__ == "__main__":
    finish_swap()
