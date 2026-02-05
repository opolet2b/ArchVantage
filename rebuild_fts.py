
import sqlite3
import os
import time

def rebuild_fts():
    # Reliable path discovery
    current_dir = os.path.dirname(os.path.abspath(__file__))
    chroma_db_path = os.path.join(current_dir, "backend", "chroma_db", "chroma.sqlite3")
    
    print(f"Rebuilding FTS for: {chroma_db_path}")
    if not os.path.exists(chroma_db_path):
        print("Error: Database not found.")
        return

    try:
        conn = sqlite3.connect(chroma_db_path)
        print("1. Sending 'rebuild' command to FTS table...")
        # This forces the FTS table to drop all data and re-read from the source table
        conn.execute("INSERT INTO embedding_fulltext_search(embedding_fulltext_search) VALUES('rebuild')")
        conn.commit()
        print("   Rebuild command committed.")
        
        # Check size of shadow table (approx row count)
        count = conn.execute("SELECT COUNT(*) FROM embedding_fulltext_search_data").fetchone()[0]
        print(f"2. New FTS Data Entry Count: {count}")
        
        conn.close()
        
        print("\n3. Please run 'python force_vacuum.py' one last time to reclaim the disk space.")
        
    except Exception as e:
        print(f"\nError: {e}")

if __name__ == "__main__":
    rebuild_fts()
