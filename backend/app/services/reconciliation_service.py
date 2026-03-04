from typing import List, Dict, Any
from app.core.arcadedb import arcadedb

class ReconciliationService:
    def get_quarantine_nodes(self, kb_id: str) -> List[Dict]:
        """Fetch nodes that are in QuarantineEntity class."""
        try:
            query = f"SELECT @rid as rid, uid, name as raw_label, summary, source_uri FROM QuarantineEntity WHERE graph_id = :gid LIMIT 100"
            res = arcadedb.query(query, params={"gid": kb_id}).get("result", [])
            
            for node in res:
                node["suggested_type"] = "Entity" 
                node["reason"] = "Class not in ontology during ingestion"
                
            return res
        except Exception as e:
            print(f"[ReconciliationService] Error fetching quarantine nodes: {e}")
            return []

    def align_node(self, kb_id: str, rid: str, target_class: str) -> bool:
        """Move a node from QuarantineEntity to an approved target_class."""
        try:
            # 1. Fetch original node properties
            # Strip the # if present
            clean_rid = rid if rid.startswith('#') else f"#{rid}"
            res = arcadedb.query(f"SELECT FROM {clean_rid}").get("result", [])
            if not res:
                print(f"[ReconciliationService] Node {clean_rid} not found.")
                return False
                
            old_node = res[0]
            
            # 2. Extract properties to copy (excluding metadata fields)
            props = {}
            for k, v in old_node.items():
                if not k.startswith('@'):
                    props[k] = v
            
            # Ensure graph_id is set
            props["graph_id"] = kb_id
            
            # Ensure target_class is properly sanitized like it is everywhere else
            import re
            sanitized_target_class = re.sub(r'[^a-zA-Z0-9_]', '_', target_class.replace(" ", "_"))
            if not sanitized_target_class:
                print(f"[ReconciliationService] Invalid empty target class after sanitization: '{target_class}'")
                return False
            
            # 3. Create new node in target_class
            set_clauses = [f"`{k}` = :{k}" for k in props.keys()]
            set_statement = ", ".join(set_clauses)
            
            insert_query = f"INSERT INTO `{sanitized_target_class}` SET {set_statement} RETURN @rid"
            new_res = arcadedb.command(insert_query, params=props)
            
            if not new_res or not new_res.get("result"):
                print("[ReconciliationService] Failed to create new aligned node.")
                return False
                
            new_rid = new_res["result"][0]["@rid"]
            
            # 4. Move Edges by Re-creating them (Safest in ArcadeDB)
            # Find incoming edges
            in_edges = arcadedb.query(f"SELECT expand(inE()) FROM {clean_rid}").get("result", [])
            for e in in_edges:
                e_rid = e["@rid"]
                e_out = e.get("@out") or e.get("out")
                e_class = e.get("@type", "KNOWLEDGE_LINK")
                e_props = {k: v for k, v in e.items() if not k.startswith('@') and k not in ('in', 'out')}
                set_clauses = [f"{k} = :{k}" for k in e_props.keys()]
                set_statement = "SET " + ", ".join(set_clauses) if set_clauses else ""
                
                print(f"Creating IN edge from {e_out} to {new_rid}")
                arcadedb.command(f"CREATE EDGE `{e_class}` FROM {e_out} TO {new_rid} {set_statement}", params=e_props)
                print(f"Deleting old IN edge {e_rid}")
                arcadedb.command(f"DELETE FROM {e_rid}")
                
            print("[ReconciliationService] Moving outgoing edges...")
            # Find outgoing edges
            out_edges = arcadedb.query(f"SELECT expand(outE()) FROM {clean_rid}").get("result", [])
            for e in out_edges:
                e_rid = e["@rid"]
                e_in = e.get("@in") or e.get("in")
                e_class = e.get("@type", "KNOWLEDGE_LINK")
                e_props = {k: v for k, v in e.items() if not k.startswith('@') and k not in ('in', 'out')}
                set_clauses = [f"{k} = :{k}" for k in e_props.keys()]
                set_statement = "SET " + ", ".join(set_clauses) if set_clauses else ""
                
                print(f"Creating OUT edge from {new_rid} to {e_in}")
                arcadedb.command(f"CREATE EDGE `{e_class}` FROM {new_rid} TO {e_in} {set_statement}", params=e_props)
                print(f"Deleting old OUT edge {e_rid}")
                arcadedb.command(f"DELETE FROM {e_rid}")
                
            print("[ReconciliationService] Deleting old node...")
            # 5. Delete old node
            try:
                arcadedb.command(f"DELETE FROM {clean_rid}", silent=True)
            except Exception as ex:
                print(f"[ReconciliationService] Ignore delete error (node likely cascade deleted): {ex}")
            
            print(f"[ReconciliationService] Aligned {clean_rid} to {new_rid} of type {target_class}")
            return True
        except Exception as e:
            print(f"[ReconciliationService] Error aligning node {rid}: {e}")
            return False

reconciliation_service = ReconciliationService()
