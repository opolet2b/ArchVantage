
import sqlite3
import os
import sys

def audit():
    chroma_db_path = 'backend/chroma_db/chroma.sqlite3'
    app_db_path = 'backend/db/sql_app.db'
    
    if not os.path.exists(chroma_db_path):
        print(f"Error: {chroma_db_path} not found.")
        return
    if not os.path.exists(app_db_path):
        print(f"Error: {app_db_path} not found.")
        return

    chroma_conn = sqlite3.connect(chroma_db_path)
    app_conn = sqlite3.connect(app_db_path)
    chroma_cur = chroma_conn.cursor()
    app_cur = app_conn.cursor()

    # 1. Get all active canvases
    app_cur.execute('SELECT id, name FROM canvases')
    canvases = {row[0]: row[1] for row in app_cur.fetchall()}
    print(f"Active Canvases in App: {len(canvases)}")

    # 2. Total embeddings count
    chroma_cur.execute('SELECT COUNT(*) FROM embeddings')
    total_embeddings = chroma_cur.fetchone()[0]
    print(f"Total Embeddings in Chroma: {total_embeddings}")

    # 3. Canvas ID distribution
    chroma_cur.execute('SELECT string_value, COUNT(*) FROM embedding_metadata WHERE key = "canvas_id" GROUP BY string_value')
    canvas_metadata = chroma_cur.fetchall()
    
    accounted_count = 0
    orphan_canvas_count = 0
    
    print("\nEmbeddings per Canvas (from metadata):")
    for cid, count in canvas_metadata:
        if cid in canvases:
            print(f"  - [ACTIVE]  {canvases[cid]} ({cid}): {count}")
            accounted_count += count
        else:
            print(f"  - [ORPHAN]  {cid}: {count}")
            orphan_canvas_count += count

    # 4. Conversation ID distribution (for direct chat RAG)
    chroma_cur.execute('SELECT string_value, COUNT(*) FROM embedding_metadata WHERE key = "conversation_id" GROUP BY string_value')
    conv_metadata = chroma_cur.fetchall()
    
    # Conversations are stored in canvas_things with type='conversation'
    # and id in content['conversation_id']
    import json
    app_cur.execute('SELECT content FROM canvas_things WHERE type = "conversation"')
    active_convs = set()
    for row in app_cur.fetchall():
        try:
            content = json.loads(row[0]) if isinstance(row[0], str) else row[0]
            cid = content.get('conversation_id')
            if cid:
                active_convs.add(str(cid))
        except Exception:
            pass
            
    conv_count = 0
    orphan_conv_count = 0
    print("\nEmbeddings per Conversation (Chat RAG):")
    for cvid, count in conv_metadata:
        if cvid in active_convs:
             conv_count += count
        else:
             orphan_conv_count += count
    
    print(f"  - Active Conversations: {len(active_convs)} groups, {conv_count} embeddings")
    print(f"  - Orphaned Conversations: {orphan_conv_count} embeddings")

    # 5. Summary of unaccounted
    # This checks for embeddings that have NEITHER canvas_id NOR conversation_id
    chroma_cur.execute('''
        SELECT COUNT(*) FROM embeddings 
        WHERE id NOT IN (SELECT id FROM embedding_metadata WHERE key IN ("canvas_id", "conversation_id"))
    ''')
    no_id_metadata = chroma_cur.fetchone()[0]
    
    print(f"\nSummary:")
    print(f"  - Total Row Count: {total_embeddings}")
    print(f"  - Accounted (Canvas): {accounted_count}")
    print(f"  - Accounted (Chat): {conv_count}")
    print(f"  - Orphaned (Canvas): {orphan_canvas_count}")
    print(f"  - Orphaned (Chat): {orphan_conv_count}")
    print(f"  - No ID Metadata: {no_id_metadata}")
    
    # 6. Check for massive metadata keys again
    chroma_cur.execute('SELECT key, SUM(LENGTH(string_value)) as total_size FROM embedding_metadata GROUP BY key ORDER BY total_size DESC LIMIT 10')
    large_metadata = chroma_cur.fetchall()
    print("\nTop 10 Largest Metadata Keys (by char length):")
    for key, size in large_metadata:
        print(f"  - {key}: {size / 1024 / 1024:.2f} MB")

    chroma_conn.close()
    app_conn.close()

if __name__ == "__main__":
    audit()
