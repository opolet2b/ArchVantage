
import sqlite3
import os

def list_sources():
    chroma_db_path = 'backend/chroma_db/chroma.sqlite3'
    if not os.path.exists(chroma_db_path):
        return

    conn = sqlite3.connect(chroma_db_path)
    cursor = conn.cursor()

    print("Querying all sources...")
    cursor.execute('''
        SELECT string_value, COUNT(*) as count 
        FROM embedding_metadata 
        WHERE key = 'source' 
        GROUP BY string_value 
        ORDER BY count DESC
    ''')
    sources = cursor.fetchall()
    
    with open('chroma_sources_inventory.txt', 'w', encoding='utf-8') as f:
        f.write("ChromaDB Source Inventory\n")
        f.write("========================\n\n")
        for source, count in sources:
            f.write(f"- {source}: {count} chunks\n")
            
    print(f"Inventory written to chroma_sources_inventory.txt. Found {len(sources)} unique sources.")
    conn.close()

if __name__ == "__main__":
    list_sources()
