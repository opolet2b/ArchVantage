
import sqlite3
import os
import time

def emergency_shrink():
    db_path = "backend/chroma_db/chroma.sqlite3"
    if not os.path.exists(db_path):
        print(f"Error: Database not found at {db_path}")
        return

    start_size = os.path.getsize(db_path) / (1024*1024*1024)
    print(f"Starting Emergency Shrink. Current size: {start_size:.2f} GB")
    print("Connecting via raw SQLite (bypassing heavy ChromaDB client)...")
    
    try:
        # Connecting with a timeout and isolation level None for manual transaction control
        conn = sqlite3.connect(db_path, timeout=30)
        cursor = conn.cursor()
        
        # 1. Identify valid IDs (those with canvas_id or conversation_id)
        print("Finding valid records...")
        cursor.execute('''
            CREATE TEMPORARY TABLE valid_ids AS
            SELECT DISTINCT id FROM embedding_metadata 
            WHERE key IN ("canvas_id", "conversation_id")
        ''')
        
        cursor.execute("SELECT COUNT(*) FROM valid_ids")
        valid_count = cursor.fetchone()[0]
        print(f"Found {valid_count} valid embeddings to preserve.")

        # 2. Delete everything else
        # This is the most efficient way to clear millions of rows in SQLite
        print("Purging 3,000,000+ orphaned records... Please wait.")
        
        # We delete metadata first
        cursor.execute("DELETE FROM embedding_metadata WHERE id NOT IN (SELECT id FROM valid_ids)")
        print("- Metadata purged.")
        
        # Then the massive embeddings table
        cursor.execute("DELETE FROM embeddings WHERE id NOT IN (SELECT id FROM valid_ids)")
        print("- Embeddings purged.")
        
        # 3. Reclaim Space
        print("Executing VACUUM to shrink file (this is the final step)...")
        conn.execute("VACUUM")
        
        conn.commit()
        conn.close()
        
        end_size = os.path.getsize(db_path) / (1024*1024)
        print(f"\nSUCCESS! Database shrunk from {start_size:.2f} GB to {end_size:.2f} MB.")
        print("You can now start your backend server. It should be instant.")
        
    except sqlite3.OperationalError as e:
        if "locked" in str(e).lower():
            print("\nERROR: Database is still locked. Please ensure ALL Python processes are stopped.")
        else:
            print(f"\nERROR: {e}")
    except Exception as e:
        print(f"\nERROR: {e}")

if __name__ == "__main__":
    emergency_shrink()
