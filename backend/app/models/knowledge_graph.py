import uuid
from sqlalchemy import Column, String, JSON, Integer
from app.core.database import Base
from app.core.arcadedb import arcadedb

class KnowledgeBaseConfig(Base):
    __tablename__ = "knowledge_base_configs"
    
    id = Column(String, primary_key=True, index=True, default=lambda: str(uuid.uuid4()))
    name = Column(String, index=True)
    description = Column(String, nullable=True)
    llm_config_id = Column(String, nullable=True)
    sources = Column(JSON, default=list)
    status = Column(String, default="draft") # draft, active, creating
    ontology_classes = Column(JSON, default=list)
    ontology_edges = Column(JSON, default=list)
    selected_source_ids = Column(JSON, default=list)
    node_count = Column(Integer, default=0)
    edge_count = Column(Integer, default=0)
    ingestion_status = Column(String, default="idle") # idle, running, completed, failed
    file_hashes = Column(JSON, default=dict) # Tracks { "filepath": "hash_value" }
    
# Schema Initialization script for ArcadeDB

# Schema Initialization script for ArcadeDB
def init_knowledge_graph_schema():
    """
    Initializes the ArcadeDB schema for the Knowledge Graph based on the design specs.
    It creates Vertex and Edge classes, and their respective properties and indexes.
    """
    print("[SchemaInit] Starting ArcadeDB schema initialization...")
    
    # Check reachability with a short timeout to avoid blocking background threads unnecessarily
    # (Even though it's backgrounded, we don't want to hang the thread too long)
    if not arcadedb.is_reachable(timeout=1.0):
        print("[SchemaInit] WARNING: ArcadeDB is not reachable. Background schema initialization will not proceed.")
        return

    # 0. Ensure database exists
    if not arcadedb.create_database():
        print("[SchemaInit] Database creation check returned False. Continuing anyway...")
    else:
        print("[SchemaInit] Database check/creation successful.")
    
    # 1. Base Vertex and Edge Types
    base_types = [
        ("Entity", "CREATE VERTEX TYPE Entity"),
        ("KNOWLEDGE_LINK", "CREATE EDGE TYPE KNOWLEDGE_LINK"),
        ("Ontology", "CREATE VERTEX TYPE Ontology"),
        ("NodeType", "CREATE VERTEX TYPE NodeType"),
        ("EdgeType", "CREATE EDGE TYPE EdgeType"),
        ("QuarantineEntity", "CREATE VERTEX TYPE QuarantineEntity")
    ]
    
    for type_name, cmd in base_types:
        try:
            print(f"[SchemaInit] Checking/Creating type: {type_name}")
            # Pass _retry=False to prevent infinite recursion during schema auto-creation
            if not arcadedb.type_exists(type_name, _retry=False):
                print(f"[SchemaInit] Executing: {cmd}")
                arcadedb.command(cmd, silent=True, _retry=False)
        except Exception as e:
            print(f"[SchemaInit] Error creating type {type_name}: {e}")
            pass # Already exists or handled by silent=True

    # 2. Properties
    properties = [
        "CREATE PROPERTY Entity.uid String",
        "CREATE PROPERTY Entity.graph_id String",
        "CREATE PROPERTY Ontology.graph_id String",
        "CREATE PROPERTY NodeType.id String",
        "CREATE PROPERTY EdgeType.label String",
        "CREATE PROPERTY KNOWLEDGE_LINK.relation_type String",
        "CREATE PROPERTY KNOWLEDGE_LINK.graph_id String"
    ]
    
    for cmd in properties:
        try:
            arcadedb.command(cmd, silent=True, _retry=False)
        except Exception as e:
            pass

    # 3. Indices
    indices = [
        "CREATE INDEX ON Entity (uid) UNIQUE",
        "CREATE INDEX ON Entity (graph_id) NOTUNIQUE",
        "CREATE INDEX ON Ontology (graph_id) NOTUNIQUE",
        "CREATE INDEX ON NodeType (id) NOTUNIQUE",
        "CREATE INDEX ON KNOWLEDGE_LINK (relation_type) NOTUNIQUE",
        "CREATE INDEX ON KNOWLEDGE_LINK (graph_id) NOTUNIQUE"
    ]
    
    for cmd in indices:
        try:
            arcadedb.command(cmd, silent=True, _retry=False)
        except Exception as e:
            pass

if __name__ == "__main__":
    init_knowledge_graph_schema()
