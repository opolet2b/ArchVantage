import sqlite3
import os
import sys

# Standard fastapi-react location
DB_PATH = "./backend/db/sql_app.db"
if not os.path.exists(DB_PATH):
    # Fallback to user provided path just in case
    if os.path.exists("./backend/sql_app.db") and os.path.getsize("./backend/sql_app.db") > 0:
        DB_PATH = "./backend/sql_app.db"
    elif os.path.exists("./sql_app.db"):
        DB_PATH = "./sql_app.db"
    else:
        print(f"Could not find sql_app.db at {DB_PATH}")
        sys.exit(1)

CONVO_ID = "dc0c73dd-558c-4d37-a160-ef05c882f81e"

conn = sqlite3.connect(DB_PATH)
conn.row_factory = sqlite3.Row
c = conn.cursor()

try:
    print(f"--- Inspecting Conversation: {CONVO_ID} ---")
    
    # 1. Check Thing Entry via content search
    c.execute("SELECT id, title, type, domain_id, content FROM canvas_things WHERE content LIKE ?", ('%' + CONVO_ID + '%',))
    convo_row = c.fetchone()
    
    if not convo_row:
        # Check by ID
        c.execute("SELECT id, title, type, domain_id, content FROM canvas_things WHERE id = ?", (CONVO_ID,))
        convo_row = c.fetchone()
        
    if not convo_row:
        print("!! Conversation Thing NOT FOUND in canvas_things !!")
        sys.exit()
            
    print(f"Thing ID: {convo_row['id']}")
    print(f"Title: {convo_row['title']}")
    print(f"Domain ID: {convo_row['domain_id']}")
    
    thing_id = convo_row['id']
    domain_id = convo_row['domain_id']

    # 2. Check Links
    print("\n--- Links ---")
    c.execute("SELECT * FROM canvas_links WHERE source_id = ?", (thing_id,))
    links_out = c.fetchall()
    
    c.execute("SELECT * FROM canvas_links WHERE target_id = ?", (thing_id,))
    links_in = c.fetchall()
    
    print(f"Outgoing Links: {len(links_out)}")
    for l in links_out:
        print(f" -> To {l['target_id']} (Type: {l['type']})")
        
    print(f"Incoming Links: {len(links_in)}")
    for l in links_in:
        print(f" <- From {l['source_id']} (Type: {l['type']})")

    # 3. Check Domain Context
    if domain_id:
        print(f"\n--- Domain Context ({domain_id}) ---")
        c.execute("SELECT * FROM domains WHERE id = ?", (domain_id,))
        domain = c.fetchone()
        if domain:
            print(f"Domain Name: {domain['name']}")
            # Check siblings
            c.execute("SELECT id, title, type FROM canvas_things WHERE domain_id = ? AND id != ?", (domain_id, thing_id))
            siblings = c.fetchall()
            print(f"Siblings in Domain: {len(siblings)}")
            for s in siblings:
                print(f" - {s['title']} ({s['type']})")
        else:
            print("Domain ID set but Domain NOT FOUND in DB!")
            
    # 4. Check Linked Domain Content
    print("\n--- Linked Domains Check ---")
    for l in links_out:
        c.execute("SELECT * FROM domains WHERE id = ?", (l['target_id'],))
        d = c.fetchone()
        if d:
            print(f"Linked to Domain: {d['name']} ({d['id']})")
            c.execute("SELECT id, title FROM canvas_things WHERE domain_id = ?", (d['id'],))
            children = c.fetchall()
            print(f" -> Found {len(children)} children in valid linked domain.")

except Exception as e:
    print(f"Error: {e}")
finally:
    conn.close()
