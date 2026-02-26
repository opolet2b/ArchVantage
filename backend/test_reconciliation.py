import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.core.arcadedb import arcadedb
from app.services.reconciliation_service import reconciliation_service

kb_id = "test_recon_graph"

def test_reconciliation():
    try:
        # Create Entity Type if not exists
        arcadedb.command("CREATE VERTEX TYPE TargetClass IF NOT EXISTS EXTENDS Entity", silent=True)
        arcadedb.command("CREATE EDGE TYPE KNOWLEDGE_LINK IF NOT EXISTS", silent=True)
        
        import uuid
        uid1 = uuid.uuid4().hex
        uid2 = uuid.uuid4().hex
        
        # 1. Insert an existing Entity
        res1 = arcadedb.command("INSERT INTO Entity SET uid=:u, name='Existing Node', graph_id=:kb RETURN @rid", params={"kb": kb_id, "u": uid1})
        rid_existing = res1["result"][0]["@rid"]
        
        # 2. Insert QuarantineEntity
        res2 = arcadedb.command("INSERT INTO QuarantineEntity SET uid=:u, name='Legacy Node', graph_id=:kb RETURN @rid", params={"kb": kb_id, "u": uid2})
        rid_quarantine = res2["result"][0]["@rid"]
        
        # 3. Create Edges
        arcadedb.command(f"CREATE EDGE KNOWLEDGE_LINK FROM {rid_existing} TO {rid_quarantine} SET relation_type='TEST_REL'")
        arcadedb.command(f"CREATE EDGE KNOWLEDGE_LINK FROM {rid_quarantine} TO {rid_existing} SET relation_type='TEST_REL_OUT'")
        
        print("Setup complete.")
        
        # 4. Fetch Quarantine Nodes
        q_nodes = reconciliation_service.get_quarantine_nodes(kb_id)
        print(f"Quarantine nodes found: {len(q_nodes)}")
        
        # 5. Align Node
        target_class = "TargetClass"
        print(f"Aligning {rid_quarantine} to {target_class}...")
        success = reconciliation_service.align_node(kb_id, rid_quarantine, target_class)
        print(f"Alignment success: {success}")
        
        if success:
            # 6. Verify New Node and Edges
            res = arcadedb.query(f"SELECT FROM TargetClass WHERE name='Legacy Node'")["result"]
            print(f"New aligned node: {res}")
            new_rid = res[0]["@rid"]
            
            in_edges = arcadedb.query(f"SELECT FROM E WHERE in = {new_rid}")["result"]
            out_edges = arcadedb.query(f"SELECT FROM E WHERE out = {new_rid}")["result"]
            
            print(f"In edges: {len(in_edges)}")
            print(f"Out edges: {len(out_edges)}")
            
            old_res = arcadedb.query(f"SELECT FROM {rid_quarantine}").get("result", [])
            print(f"Is old node deleted? {len(old_res) == 0}")
            
    except Exception as e:
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    test_reconciliation()
