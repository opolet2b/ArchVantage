
import sqlite3
import os

def analyze_bloat():
    # Reliable path discovery
    current_dir = os.path.dirname(os.path.abspath(__file__))
    chroma_db_path = os.path.join(current_dir, "backend", "chroma_db", "chroma.sqlite3")
    
    conn = sqlite3.connect(chroma_db_path)
    cursor = conn.cursor()
    
    print(f"Analyzing DB: {chroma_db_path}")
    print(f"File Size: {os.path.getsize(chroma_db_path) / (1024**3):.2f} GB")
    
    # 1. Check Page Count & Size
    page_count = cursor.execute("PRAGMA page_count").fetchone()[0]
    page_size = cursor.execute("PRAGMA page_size").fetchone()[0]
    freelist_count = cursor.execute("PRAGMA freelist_count").fetchone()[0]
    
    print(f"Page Count: {page_count}")
    print(f"Freelist Count: {freelist_count} (Pages marked as free but not returned to OS)")
    
    if freelist_count > 0:
        print(f"Potential recoverable space: {(freelist_count * page_size) / (1024**3):.2f} GB")
    
    # 2. Estimate table sizes via count (Raw byte size requires external tools usually)
    print("\nTable Row Counts:")
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
    tables = cursor.fetchall()
    
    for table in tables:
        table_name = table[0]
        try:
            count = cursor.execute(f"SELECT COUNT(*) FROM {table_name}").fetchone()[0]
            print(f"- {table_name}: {count} rows")
        except:
            print(f"- {table_name}: (Error counting)")
            
    conn.close()

if __name__ == "__main__":
    analyze_bloat()
