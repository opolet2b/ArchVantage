
import sqlite3
import os

def inspect():
    chroma_db_path = 'backend/chroma_db/chroma.sqlite3'
    if not os.path.exists(chroma_db_path):
        return

    conn = sqlite3.connect(chroma_db_path)
    cursor = conn.cursor()

    # Find IDs of records without canvas_id or conversation_id
    print("Finding sample unlabelled record IDs...")
    cursor.execute('''
        SELECT id FROM embeddings 
        WHERE id NOT IN (SELECT id FROM embedding_metadata WHERE key IN ("canvas_id", "conversation_id"))
        LIMIT 10
    ''')
    ids = [row[0] for row in cursor.fetchall()]
    
    if not ids:
        print("No unlabelled records found (matching this specific filter).")
        # Try a broader check: just any records and see their keys
        cursor.execute('SELECT DISTINCT id FROM embedding_metadata LIMIT 10')
        ids = [row[0] for row in cursor.fetchall()]

    for id in ids:
        cursor.execute('SELECT key, string_value FROM embedding_metadata WHERE id = ?', (id,))
        metadata = cursor.fetchall()
        print(f"\n--- Record ID {id} ---")
        if not metadata:
            print("  (No metadata entries found for this ID)")
        else:
            for key, val in metadata:
                # Truncate long values
                display_val = (val[:100] + '...') if isinstance(val, str) and len(val) > 100 else val
                print(f"  {key}: {display_val}")

    # Check for specific files that might be huge
    print("\nTop sources by chunk count (where key='source'):")
    cursor.execute('''
        SELECT string_value, COUNT(*) as count 
        FROM embedding_metadata 
        WHERE key = 'source' 
        GROUP BY string_value 
        ORDER BY count DESC 
        LIMIT 10
    ''')
    for source, count in cursor.fetchall():
        print(f"  - {source}: {count} chunks")

    conn.close()

if __name__ == "__main__":
    inspect()
