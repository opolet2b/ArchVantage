
import sqlite3
import os
import time

def rescue_db():
    current_dir = os.path.dirname(os.path.abspath(__file__))
    src_db = os.path.join(current_dir, "backend", "chroma_db", "chroma.sqlite3")
    dst_db = os.path.join(current_dir, "backend", "chroma_db", "chroma_clean.sqlite3")
    
    if not os.path.exists(src_db):
        print("Source DB not found")
        return

    print(f"Rescuing DB: {src_db} -> {dst_db}")
    
    if os.path.exists(dst_db):
        os.remove(dst_db)
        
    # Connect to New DB
    conn_new = sqlite3.connect(dst_db)
    # Attach Old DB
    conn_new.execute(f"ATTACH DATABASE '{src_db}' AS old_db")
    
    # Get List of Tables
    cursor = conn_new.execute("SELECT name, sql FROM old_db.sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
    tables = cursor.fetchall()
    
    print(f"Found {len(tables)} tables to copy...")
    
    for name, sql in tables:
        if "embedding_fulltext_search" in name: 
            print(f"Skipping FTS table: {name} (Will be rebuilt automatically)")
            continue
            
        print(f"Copying table: {name}...")
        # Create Table
        conn_new.execute(sql)
        # Copy Data
        conn_new.execute(f"INSERT INTO main.{name} SELECT * FROM old_db.{name}")
        
    conn_new.commit()
    conn_new.execute("DETACH DATABASE old_db")
    conn_new.close()
    
    final_size = os.path.getsize(dst_db) / (1024*1024)
    print(f"\nSUCCESS! New Database Size: {final_size:.2f} MB")
    print("Renaming files...")
    
    # Swap
    backup = src_db + ".bak"
    if os.path.exists(backup):
        os.remove(backup)
        
    os.rename(src_db, backup)
    os.rename(dst_db, src_db)
    print("Done. Original is at chroma.sqlite3.bak")

if __name__ == "__main__":
    rescue_db()
