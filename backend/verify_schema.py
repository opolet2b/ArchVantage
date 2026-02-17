"""
Verification Script for Schema Discovery

Tests if get_node_output_schema correctly returns fields for FOREACH_START.
"""
import sys
import os
import json

# Set backend path
sys.path.append(os.path.abspath("backend"))

from app.services.schema_discovery import get_node_output_schema

def test_foreach_schema():
    print("Testing Schema Discovery for FOREACH_START...")
    
    graph = {
        "nodes": [
            {
                "id": "loop_start",
                "type": "FOREACH_START",
                "params": {
                    "iterator_var": "my_item",
                    "index_var": "idx",
                    "results_var": "all_items"
                }
            }
        ],
        "edges": []
    }
    
    schema = get_node_output_schema(graph, "loop_start")
    print(json.dumps(schema, indent=2))
    
    fields = {f["name"] for f in schema.get("fields", [])}
    expected = {"my_item", "idx", "all_items"}
    
    if expected.issubset(fields):
        print("SUCCESS: All expected fields found.")
    else:
        print(f"FAILURE: Missing fields. Found: {fields}")

if __name__ == "__main__":
    test_foreach_schema()
