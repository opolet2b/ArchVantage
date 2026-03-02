from app.core.arcadedb import arcadedb

def test_recovery():
    print("Testing recovery...")
    print("1. Testing create_database direct")
    res = arcadedb.create_database()
    print("Create Result:", res)
    
    print("\n2. Testing auto-recovery via a query")
    try:
        # If DB doesn't exist, this should trigger init_knowledge_graph_schema
        # and not loop infinitely
        res2 = arcadedb.query("SELECT 1")
        print("Query Result:", res2)
    except Exception as e:
        print("Query Exception:", e)

if __name__ == "__main__":
    test_recovery()
