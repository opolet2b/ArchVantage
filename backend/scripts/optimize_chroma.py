import sqlite3
import os
import sys
from pathlib import Path

# Add backend to path to use services if needed
sys.path.append(str(Path(__file__).parent.parent))

def optimize_chroma(db_path, dry_run=True):
    if not os.path.exists(db_path):
        print(f"Error: Database not found at {db_path}")
        return

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    try:
        # 1. Identify Redundant Metadata
        print("--- Analyzing Metadata ---")
        cursor.execute("SELECT COUNT(*) FROM embedding_metadata WHERE key = '_node_content';")
        redundant_count = cursor.fetchone()[0]
        
        if redundant_count == 0:
            print("No redundant '_node_content' metadata found.")
        else:
            print(f"Found {redundant_count} redundant '_node_content' entries.")
            if not dry_run:
                print("Deleting redundant metadata...")
                cursor.execute("DELETE FROM embedding_metadata WHERE key = '_node_content';")
                conn.commit()
                print("Deletion complete.")
            else:
                print("[DRY RUN] Skipping deletion.")

        # 2. Check for Duplicate Embeddings/Chunks 
        # (This is harder to delete safely without breaking indices, but we can check)
        
        # 3. VACUUM
        print("--- VACUUM ---")
        cursor.execute("PRAGMA page_count;")
        page_count_before = cursor.fetchone()[0]
        cursor.execute("PRAGMA page_size;")
        page_size = cursor.fetchone()[0]
        
        size_before = (page_count_before * page_size) / (1024 * 1024 * 1024)
        print(f"Current Size: {size_before:.2f} GB")

        if not dry_run:
            print("Performing VACUUM (this may take a long time and requires disk space)...")
            cursor.execute("VACUUM;")
            print("VACUUM complete.")
            
            cursor.execute("PRAGMA page_count;")
            page_count_after = cursor.fetchone()[0]
            size_after = (page_count_after * page_size) / (1024 * 1024 * 1024)
            print(f"New Size: {size_after:.2f} GB")
            print(f"Reclaimed: {size_before - size_after:.2f} GB")
        else:
            print("[DRY RUN] Skipping VACUUM.")

    except Exception as e:
        print(f"Error during optimization: {e}")
        conn.rollback()
    finally:
        conn.close()

if __name__ == "__main__":
    db_file = os.path.join("backend", "chroma_db", "chroma.sqlite3")
    
    apply_flag = "--apply" in sys.argv
    is_dry_run = not apply_flag
    
    if is_dry_run:
        print("Running in DRY RUN mode. Use --apply to actually modify the database.")
    
    optimize_chroma(db_file, dry_run=is_dry_run)
