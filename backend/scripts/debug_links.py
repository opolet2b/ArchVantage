
import sqlite3
import os
from pathlib import Path

DB_PATH = Path(__file__).parent.parent / "db" / "sql_app.db"

def debug():
    print(f"Connecting to {DB_PATH}")
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    # 1. Find Canvases
    print("\n--- Canvases ---")
    cursor.execute("SELECT id, name, analysis_space_id FROM canvases WHERE name LIKE '%Untitled Canvas 2%' OR name LIKE '%ERZ%'")
    canvases = cursor.fetchall()
    canvas_map = {}
    for c in canvases:
        print(f"CANVAS: {c[1]}")
        print(f"  ID: {c[0]}")
        print(f"  SPACE_ID: {c[2]}")
        canvas_map[c[1]] = c[0]
        
    if not canvas_map:
        print("Could not find specified canvases.")
        return

    # 2. Find Things
    print("\n--- Things ---")
    thing_map = {}
    # Use wildcards for loose matching
    # Map back which canvas it belongs to
    thing_canvas_map = {}
    
    cursor.execute("SELECT id, title, canvas_id, content FROM canvas_things WHERE canvas_id IN (?, ?) AND (title LIKE '%Casque%' OR title LIKE '%zemis%')", (canvas_map.get("Untitled Canvas 2"), canvas_map.get("ERZ")))
    things = cursor.fetchall()
    for t in things:
        title = t[1]
        if not title:
            import json
            try:
                content = json.loads(t[3])
                title = content.get("filename") or content.get("text") or "Untitled"
            except:
                title = "Error parsing content"
                
        print(f"THING: {title}")
        print(f"  ID: {t[0]}")
        print(f"  CANVAS_ID: {t[2]}")
        thing_map[t[0]] = title
        thing_canvas_map[t[0]] = t[2]

    # 3. Find Links
    print("\n--- Links ---")
    if not thing_map:
        print("No things found.")
    else:
        thing_ids = list(thing_map.keys())
        placeholders = ','.join(['?'] * len(thing_ids))
        query = f"SELECT id, source_id, target_id, canvas_id, target_canvas_id, type FROM canvas_links WHERE source_id IN ({placeholders}) OR target_id IN ({placeholders})"
        cursor.execute(query, thing_ids + thing_ids)
        links = cursor.fetchall()
        for l in links:
            src_name = thing_map.get(l[1], l[1])
            tgt_name = thing_map.get(l[2], l[2])
            print(f"LINK: {src_name} -> {tgt_name}")
            print(f"  ID: {l[0]}")
            print(f"  SOURCE_CANVAS: {l[3]}")
            print(f"  TARGET_CANVAS_FIELD: {l[4]}")
            
            # Additional Check: Does TARGET_CANVAS_FIELD match the actual canvas of the target thing?
            real_target_canvas = thing_canvas_map.get(l[2], "Unknown (Not in fetched things)")
            print(f"  REAL_TARGET_CANVAS: {real_target_canvas}")
            
            if l[4] and real_target_canvas != "Unknown (Not in fetched things)" and l[4] != real_target_canvas:
                print("  [MISMATCH DETECTED]: Field target_canvas_id does not match real target canvas!")

    conn.close()

if __name__ == "__main__":
    debug()
