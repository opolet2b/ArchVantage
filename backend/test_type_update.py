import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.core.arcadedb import arcadedb

try:
    print("Creating Quarantine Entity")
    res = arcadedb.command("INSERT INTO QuarantineEntity SET name = 'Test1', graph_id = 'test_graph' RETURN @rid")
    rid = res["result"][0]["@rid"]
    print(f"Created: {rid}")
    
    print("Attempting to update @type")
    res = arcadedb.command(f"UPDATE {rid} SET @type = 'Entity'")
    print(f"Update Result: {res}")
    
    res = arcadedb.query(f"SELECT @type FROM {rid}")
    print(f"Check Type: {res}")
    
    arcadedb.command(f"DELETE FROM {rid}")
except Exception as e:
    print(f"Error: {e}")
