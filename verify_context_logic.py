import sys
import os
from sqlalchemy import create_engine, text, or_
from sqlalchemy.orm import sessionmaker

# Setup paths
sys.path.append(os.path.join(os.getcwd(), 'backend'))

from app.core.database import Base
# Import all models to ensure relationships are registered
import app.models.user
from app.models.canvas_models import CanvasThing, CanvasLink, Domain, ThingType

# Setup DB
DB_PATH = "./backend/db/sql_app.db"
if not os.path.exists(DB_PATH):
     if os.path.exists("./backend/sql_app.db") and os.path.getsize("./backend/sql_app.db") > 0:
         DB_PATH = "./backend/sql_app.db"
     elif os.path.exists("./sql_app.db"):
         DB_PATH = "./sql_app.db"
     else:
         print("DB missing")
         sys.exit(1)

DATABASE_URL = f"sqlite:///{DB_PATH}"
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
db = SessionLocal()

CONVO_ID = "dc0c73dd-558c-4d37-a160-ef05c882f81e"

print(f"--- Simulating Context Resolution for {CONVO_ID} ---")

try:
    # 1. Find Conversation Node
    # Using the same logic as chat.py
    candidates = db.query(CanvasThing).filter(CanvasThing.type == "conversation").all()
    convo_node = next((t for t in candidates if str(t.content.get("conversation_id")) == CONVO_ID), None)

    if not convo_node:
        print("Conversation Node NOT FOUND via content search.")
        # Try ID mismatch fix?
        sys.exit(1)

    print(f"Found Node: {convo_node.id} Title: {convo_node.title}")
    
    # 2. Find Linked Nodes
    links = db.query(CanvasLink).filter(
        or_(
            CanvasLink.source_id == convo_node.id,
            CanvasLink.target_id == convo_node.id
        )
    ).all()
    
    linked_ids = set()
    for link in links:
        target_id = link.target_id if link.source_id == convo_node.id else link.source_id
        linked_ids.add(target_id)
        
    print(f"Initial Linked IDs: {linked_ids}")

    # 2a. Domain Context (Recursive)
    if convo_node.domain_id:
        print(f"In Domain: {convo_node.domain_id}")
        # (Skipping fetch logic as debug_context said domain_id checks out null/valid)
    else:
        print("Not in a Domain.")

    # 2b. Linked Domains Context (The bit I fixed)
    # Check if any linked IDs are actually Domains
    print("Checking for Linked Domains...")
    # Explicit list cast
    linked_domains = db.query(Domain).filter(Domain.id.in_(list(linked_ids))).all()
    
    if linked_domains:
         print(f"Found {len(linked_domains)} explicitly linked domains.")
         for domain in linked_domains:
             print(f" - Linked Domain: {domain.name} ({domain.id})")
             
             def get_descendant_domain_ids_local(root_id):
                descendants = set([root_id])
                children = db.query(Domain).filter(Domain.parent_id == root_id).all()
                for child in children:
                    descendants.update(get_descendant_domain_ids_local(child.id))
                return descendants

             domain_tree_ids = get_descendant_domain_ids_local(domain.id)
             print(f"   - Domain Tree IDs: {domain_tree_ids}")
             
             domain_children = db.query(CanvasThing).filter(
                CanvasThing.domain_id.in_(domain_tree_ids),
                 CanvasThing.id != convo_node.id
             ).all()
             
             print(f"   - Found {len(domain_children)} children items.")
             for child in domain_children:
                 print(f"     * {child.title} ({child.type})")
                 linked_ids.add(child.id)
    else:
        print("No linked domains found via query.")

    # 3. Global Fallback check
    if len(linked_ids) == 0:
        print("Fallback to GLOBAL context.")
    else:
        print(f"Final Linked IDs Count: {len(linked_ids)}")
        
    # Generate Manifest
    print("\n--- Manifest Generation ---")
    if linked_ids:
        linked_nodes = db.query(CanvasThing).filter(CanvasThing.id.in_(linked_ids)).all()
        manifest = "You have access to the following context items:\n"
        for node in linked_nodes:
             manifest += f"- {node.title} ({node.type})\n"
        print(manifest)
    else:
        print("No manifest generated.")

except Exception as e:
    print(f"Error: {e}")
finally:
    db.close()
