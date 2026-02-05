
import sqlite3
import os

def debug_query():
    # Use the reliable path we just fixed
    current_dir = os.path.dirname(os.path.abspath(__file__))
    # Assuming this script is in project root
    chroma_db_path = os.path.join(current_dir, "backend", "chroma_db", "chroma.sqlite3")
    
    print(f"Checking DB at: {chroma_db_path}")
    if not os.path.exists(chroma_db_path):
        print("DB Not found!")
        return

    conn = sqlite3.connect(chroma_db_path)
    cursor = conn.cursor()
    
    # 1. Count Total
    cursor.execute("SELECT COUNT(*) FROM embeddings")
    total = cursor.fetchone()[0]
    print(f"Total Embeddings: {total}")
    
    # 2. Count Valid Metadata (Canvas/Convo)
    cursor.execute("SELECT COUNT(DISTINCT id) FROM embedding_metadata WHERE key IN ('canvas_id', 'conversation_id')")
    valid_ids_count = cursor.fetchone()[0]
    print(f"Valid Metadata IDs: {valid_ids_count}")
    
    print(f"\nRemaining Embeddings in DB: {conn.execute('SELECT COUNT(*) FROM embeddings').fetchone()[0]}")

    conn.close()

if __name__ == "__main__":
    debug_query()
