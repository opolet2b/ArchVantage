import os
import uuid
import rdflib
from rdflib.namespace import RDF
from fastapi import UploadFile
from app.core.arcadedb import arcadedb
from app.core.database import SessionLocal
from app.models.knowledge_graph import KnowledgeBaseConfig

class RDFIngestionService:
    def __init__(self):
        pass

    async def ingest_ttl_file(self, file: UploadFile, graph_id: str) -> dict:
        """
        Parses an uploaded RDF (Turtle) file and ingests it into ArcadeDB.
        """
        # Save uploaded file temporarily
        temp_file_path = f"/tmp/{uuid.uuid4()}_{file.filename}"
        os.makedirs(os.path.dirname(temp_file_path), exist_ok=True)
        
        try:
            with open(temp_file_path, "wb") as f:
                content = await file.read()
                f.write(content)
                
            return self.process_file(temp_file_path, graph_id)
        finally:
            if os.path.exists(temp_file_path):
                os.remove(temp_file_path)

    def process_file(self, file_path: str, graph_id: str) -> dict:
        print(f"[RDF Ingestion] Loading RDF Graph from {file_path}...")
        g = rdflib.Graph()
        try:
            # We assume it's turtle or similar format. rdflib can usually guess or parse if specified.
            g.parse(file_path, format="turtle")
        except Exception as e:
            raise ValueError(f"Failed to parse RDF file: {str(e)}")

        print(f"[RDF Ingestion] Loaded {len(g)} triples.")
        
        entities_created = 0
        edges_created = 0
        discovered_types = set()

        # Step 1: Create Entities (Vertices)
        # We look for anything that has a type declaration
        for subject, predicate, obj_type in g.triples((None, RDF.type, None)):
            entity_id = self._extract_id(subject)
            entity_type = self._extract_id(obj_type)
            
            if not entity_id or not entity_type:
                continue

            # Try to find a human-readable title/label, looking for typical labeling predicates
            title = entity_id
            for p_label in ["bezeichnung", "name", "title", "label"]:
                # simple substring search on predicates for demo purposes
                for s, p, o in g.triples((subject, None, None)):
                    if p_label.lower() in str(p).lower():
                        title = str(o)
                        break

            # Sanitize entity type to match ArcadeDB schema rules
            import re
            sanitized_type = re.sub(r'[^a-zA-Z0-9_]', '_', entity_type.replace(" ", "_"))
            
            discovered_types.add(sanitized_type)
            
            # Ensure the specific type exists in ArcadeDB and extends Entity
            try:
                if not arcadedb.type_exists(sanitized_type):
                    arcadedb.command(f"CREATE VERTEX TYPE `{sanitized_type}` EXTENDS Entity", silent=True)
                else:
                    # If it exists, ensure it extends Entity to fix legacy types
                    try:
                        arcadedb.command(f"ALTER TYPE `{sanitized_type}` SUPERTYPE Entity", silent=True)
                    except Exception:
                        pass
            except Exception:
                pass

            # Upsert the Entity in ArcadeDB
            try:
                # Check if exists first to avoid duplicate primary key if applicable
                check_query = f"SELECT FROM `{sanitized_type}` WHERE uid = '{entity_id}' AND graph_id = '{graph_id}'"
                res = arcadedb.query(check_query)
                if not res.get("result"):
                    arcadedb.command(
                        f"INSERT INTO `{sanitized_type}` SET uid = :uid, graph_id = :gid, name = :name, source_uri = :source, source_type = 'RDF'",
                        params={"uid": entity_id, "gid": graph_id, "name": title, "source": file_path}
                    )
                    entities_created += 1
            except Exception as e:
                print(f"[RDF Ingestion] Error inserting entity {entity_id} of type {sanitized_type}: {e}")

        # Step 2: Create Relationships (Edges)
        # Iterate over all triples to find object properties (where object is a URIRef)
        for subject, predicate, target in g:
            # Skip if it's just a type declaration (already handled)
            if predicate == RDF.type:
                continue
                
            # If the target is a literal (string, date, etc.), it's an attribute, not a structural link.
            if isinstance(target, rdflib.Literal):
                # For a full implementation, you could update the vertex properties here.
                continue

            source_id = self._extract_id(subject)
            target_id = self._extract_id(target)
            relation_type = self._extract_id(predicate)

            if not source_id or not target_id or not relation_type:
                continue

            try:
                # Check if both entities exist in the graph
                # In a robust implementation, we might want to ensure they exist or create dummy ones.
                edge_query = f"""
                CREATE EDGE KNOWLEDGE_LINK 
                FROM (SELECT FROM Entity WHERE uid = '{source_id}' AND graph_id = '{graph_id}') 
                TO (SELECT FROM Entity WHERE uid = '{target_id}' AND graph_id = '{graph_id}') 
                SET relation_type = '{relation_type}', graph_id = '{graph_id}', source_uri = '{file_path}'
                """
                res = arcadedb.command(edge_query)
                edges_created += 1
            except Exception as e:
                pass # usually means one of the vertices wasn't found or already exists

        # Append discovered types to the KB config so the UI taxonomy filter knows about them
        if discovered_types:
            try:
                db = SessionLocal()
                kb = db.query(KnowledgeBaseConfig).filter(KnowledgeBaseConfig.id == graph_id).first()
                if kb:
                    existing_classes = kb.ontology_classes or []
                    existing_names = [c.get("name") for c in existing_classes]
                    updated = False
                    for t in discovered_types:
                        if t not in existing_names:
                            existing_classes.append({
                                "name": t,
                                "description": f"Dynamically extracted from RDF",
                                "approved": True
                            })
                            updated = True
                    
                    if updated:
                        # Re-assign to trigger sqlalchemy JSON update
                        kb.ontology_classes = list(existing_classes)
                        db.commit()
                db.close()
            except Exception as e:
                print(f"[RDF Ingestion] Error updating KB ontology classes: {e}")

        return {
            "status": "success",
            "message": f"Successfully ingested RDF data.",
            "entities_created": entities_created,
            "edges_created": edges_created,
            "triples_parsed": len(g)
        }

    def _extract_id(self, uri: rdflib.term.Identifier) -> str:
        """Extracts the local name from a URI."""
        if isinstance(uri, rdflib.BNode):
            return str(uri)
        uri_str = str(uri)
        if "#" in uri_str:
            return uri_str.split("#")[-1]
        elif "/" in uri_str:
            return uri_str.split("/")[-1]
        return uri_str

rdf_ingestion_service = RDFIngestionService()
