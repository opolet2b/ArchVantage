import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.core.arcadedb import arcadedb

try:
    print("Creating two nodes and an edge...")
    print("Inserting Node A...")
    res1 = arcadedb.command("INSERT INTO Entity SET name='Node A' RETURN @rid")
    n1 = res1["result"][0]["@rid"]
    print("Inserting Node B...")
    res2 = arcadedb.command("INSERT INTO Entity SET name='Node B' RETURN @rid")
    n2 = res2["result"][0]["@rid"]
    
    print(f"Creating edge from {n1} to {n2}...")
    res_e = arcadedb.command(f"CREATE EDGE KNOWLEDGE_LINK FROM {n1} TO {n2} SET relation_type='TEST', graph_id='test1234' RETURN @rid")
    e_rid = res_e["result"][0]["@rid"]
    print(f"Created edge {e_rid}")
    
    print("Deleting edge with DELETE EDGE...")
    res = arcadedb.command(f"DELETE EDGE {e_rid}")
    print(f"Result: {res}")
    
except Exception as e:
    import traceback
    traceback.print_exc()
