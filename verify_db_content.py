import sys
import os
import json

# Add backend directory to sys.path
# We assume this script is run from project root (ChatBotn/)
# So 'backend/' is a subdirectory.
current_dir = os.getcwd()
backend_dir = os.path.join(current_dir, "backend")

print(f"Adding to sys.path: {backend_dir}")
sys.path.insert(0, backend_dir)

try:
    from sqlalchemy import create_engine, text
    # Try importing app.database. If it fails, we might need to set env vars or check structure.
    # We don't strictly need app.database if we just connect to the sqlite file directly
    # but let's try to simulate the environment.
except ImportError as e:
    print(f"Import Error: {e}")
    print(f"sys.path: {sys.path}")
    sys.exit(1)

# Database URL logic
# Check chatbot.db
chatbot_db = os.path.join(backend_dir, "chatbot.db")
root_db = os.path.join(current_dir, "db", "sql_app.db")
backend_db = os.path.join(backend_dir, "db", "sql_app.db")

if os.path.exists(chatbot_db):
    db_path = chatbot_db
    print(f"Using Chatbot DB: {db_path}")
elif os.path.exists(root_db):
   # ...
    db_path = root_db
    print(f"Using Root DB: {db_path}")
elif os.path.exists(backend_db):
    db_path = backend_db
    print(f"Using Backend DB: {db_path}")
else:
    print("Error: Could not find sql_app.db in root/db or backend/db")
    sys.exit(1)

if not os.path.exists(db_path):
    print(f"Error: Database file not found at {db_path}")
    sys.exit(1)

SQLALCHEMY_DATABASE_URL = f"sqlite:///{db_path}"

def verify_content(thing_id):
    try:
        engine = create_engine(SQLALCHEMY_DATABASE_URL)
        with engine.connect() as conn:
            result = conn.execute(
                text("SELECT id, content, rag_status FROM canvas_things WHERE id = :thing_id"),
                {"thing_id": thing_id}
            ).fetchone()
            
            if not result:
                print(f"Thing {thing_id} not found in DB.")
                return

            id_val, content_json, status_val = result
            print(f"\n=== DB RESULT FOR {id_val} ===")
            print(f"RAG Status: {status_val}")
            
            content = {}
            if content_json:
                if isinstance(content_json, str):
                    content = json.loads(content_json)
                else:
                    content = content_json
            
            print(f"Content Keys: {list(content.keys())}")
            
            if "description" in content:
                desc = content["description"]
                print(f"✅ 'description' FOUND! Length: {len(desc)}")
                print(f"Snippet: {desc[:50]}...")
            else:
                print("❌ 'description' MISSING.")

            if "generated_description" in content:
                 desc = content["generated_description"]
                 print(f"✅ 'generated_description' FOUND! Length: {len(desc)}")
            
            if "vision_model" in content:
                print(f"Vision Model: {content['vision_model']}")

    except Exception as e:
        print(f"Script Error: {e}")
        try:
            with engine.connect() as conn:
                tables = conn.execute(text("SELECT name FROM sqlite_master WHERE type='table'")).fetchall()
                print(f"Tables in DB: {[t[0] for t in tables]}")
        except:
            print("Could not list tables.")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python verify_db_content.py <thing_id>")
    else:
        verify_content(sys.argv[1])
