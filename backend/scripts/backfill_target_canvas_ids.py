
import sqlite3
import os
from pathlib import Path

# Database path (adjust if needed based on relative location)
DB_PATH = Path(__file__).parent.parent / "db" / "sql_app.db"

def migrate():
    print(f"Connecting to database at {DB_PATH.resolve()}")
    if not DB_PATH.exists():
        print("Database file not found!")
        return

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    try:
        # Get all links where target_canvas_id is NULL
        print("Fetching links with NULL target_canvas_id...")
        cursor.execute("SELECT id, source_id, target_id, canvas_id FROM canvas_links WHERE target_canvas_id IS NULL OR target_canvas_id = ''")
        links = cursor.fetchall()
        print(f"Found {len(links)} links to check.")

        updates = 0
        
        for link in links:
            link_id, source_id, target_id, original_canvas_id = link
            
            # Find the target thing's canvas_id
            target_canvas_id = None
            
            # Check CanvasThing
            cursor.execute("SELECT canvas_id FROM canvas_things WHERE id = ?", (target_id,))
            result = cursor.fetchone()
            if result:
                target_canvas_id = result[0]
            else:
                # Check Domain
                cursor.execute("SELECT canvas_id FROM domains WHERE id = ?", (target_id,))
                result = cursor.fetchone()
                if result:
                    target_canvas_id = result[0]
            
            if target_canvas_id:
                # Update the link
                # Only update if it's different from potentially implied "local" (but we want to populate it regardless for consistency, or only if different?)
                # The frontend filters with: if (!link.target_canvas_id || link.target_canvas_id === sourceCanvas.id) return;
                # So for LOCAL links, target_canvas_id SHOULD be the same as canvas_id.
                # For EXTERNAL links, it should be different.
                # So we should populate it ALWAYS.
                
                cursor.execute("UPDATE canvas_links SET target_canvas_id = ? WHERE id = ?", (target_canvas_id, link_id))
                updates += 1
                if updates % 100 == 0:
                    print(f"Updated {updates} links...")
            else:
                print(f"Warning: Target {target_id} (Link {link_id}) not found in Things or Domains.")

        conn.commit()
        print(f"Migration complete. Updated {updates} links.")

    except Exception as e:
        print(f"Error during migration: {e}")
        conn.rollback()
    finally:
        conn.close()

if __name__ == "__main__":
    migrate()
