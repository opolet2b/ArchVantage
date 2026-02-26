import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.core.arcadedb import arcadedb

try:
    print("--- Checking Edges (KNOWLEDGE_LINK) ---")
    res = arcadedb.query("SELECT FROM KNOWLEDGE_LINK LIMIT 5").get("result", [])
    for i, edge in enumerate(res):
        print(f"Edge {i}: {edge}")
        print(f"  Fields: {list(edge.keys())}")
        print(f"  @in: {edge.get('@in')}, @out: {edge.get('@out')}")
        print(f"  in: {edge.get('in')}, out: {edge.get('out')}")

    print("\n--- Checking for Duplicate Entities ---")
    res = arcadedb.query("SELECT name, graph_id, count(*) as count FROM Entity GROUP BY name, graph_id HAVING count > 1").get("result", [])
    if res:
        print(f"Found {len(res)} sets of duplicate entities.")
        for r in res[:5]:
            print(f"  {r['name']} (graph: {r['graph_id']}): {r['count']} copies")
    else:
        print("No duplicate entities found.")

except Exception as e:
    print(f"Error during inspection: {e}")
