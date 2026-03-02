import os
import json
from typing import List, Dict, Any
from app.core.arcadedb import arcadedb
from app.services.llm_service import llm_service
from app.utils.document_parser import document_parser
from app.services.web_crawler_service import web_crawler_service

class OntologyService:
    def parse_json_ontology(self, content: str) -> Dict[str, Any]:
        """
        Parses a custom JSON-LD or structured JSON ontology.
        Expected format: {"nodes": [{"id": "...", "label": "..."}], "edges": [{"label": "...", "constraints": {...}}]}
        """
        try:
            data = json.loads(content)
            return {
                "nodes": data.get("nodes", []),
                "edges": data.get("edges", [])
            }
        except Exception as e:
            raise ValueError(f"Failed to parse JSON ontology: {e}")

    async def extract_taxonomy_from_sources(self, sources: List[Dict], llm_config_id: str):
        """
        Scans provided sources (currently supports Local Directories) and yields potential ontology classes 
        along with real-time progress updates.
        Generator yields JSON-serializable dictionaries as strings.
        """
        accumulated_text = ""
        total_sources = len(sources)
        
        yield json.dumps({"type": "progress", "message": f"Starting extraction from {total_sources} source(s)..."})
        
        for source in sources:
            source_type = source.get("type")
            path = source.get("config", {}).get("path")
            
            if source_type == "local" and path and os.path.exists(path):
                # Simple extraction: Grab the first few kb of text from available txt/md files
                allowed_extensions = (".txt", ".md", ".csv", ".pdf", ".docx", ".pptx", ".xml", ".xlsx", ".html", ".htm")

                if os.path.isdir(path):
                    files = [f for f in os.listdir(path) if f.endswith(allowed_extensions)]
                    yield json.dumps({"type": "progress", "message": f"Found {len(files)} valid file(s) in directory: {path}"})
                    
                    for filename in files:
                        filepath = os.path.join(path, filename)
                        yield json.dumps({"type": "progress", "message": f"Reading file: {filename}..."})
                        try:
                            content = document_parser.extract_text_from_file(filepath, char_limit=40000)
                            if content.strip():
                                accumulated_text += f"\n--- Source: {filename} ---\n{content}\n"
                        except Exception as e:
                            print(f"Skipping {filename}: {e}")
                            yield json.dumps({"type": "progress", "message": f"Warning: Failed to read {filename}."})
                elif os.path.isfile(path) and path.endswith(allowed_extensions):
                     yield json.dumps({"type": "progress", "message": f"Reading single file: {os.path.basename(path)}..."})
                     try:
                        content = document_parser.extract_text_from_file(path, char_limit=100000)
                        if content.strip():
                            accumulated_text += f"\n--- Source: {os.path.basename(path)} ---\n{content}\n"
                     except Exception as e:
                         print(f"Skipping {path}: {e}")
                         yield json.dumps({"type": "progress", "message": f"Warning: Failed to read {os.path.basename(path)}."})
            
            elif source_type == "url":
                url = source.get("config", {}).get("url")
                # For ontology extraction, we cap at depth 2 to keep it fast, or use user preference
                depth = int(source.get("config", {}).get("max_depth") or 1)
                if url:
                    yield json.dumps({"type": "progress", "message": f"Crawling URL for taxonomy: {url} (depth={depth})..."})
                    try:
                        content = web_crawler_service.crawl_url(url, max_depth=depth)
                        if content.strip():
                            accumulated_text += content
                    except Exception as e:
                        yield json.dumps({"type": "progress", "message": f"Warning: Failed to crawl {url}: {e}"})

        if not accumulated_text.strip():
             msg = "No text accumulated from sources!"
             print(f"[OntologyService] WARNING: {msg}")
             yield json.dumps({"type": "progress", "message": msg})
             yield json.dumps({"type": "result", "classes": []})
             return

        # Cap the text to avoid context limits on smaller models, but bump to 500k chars for thorough scan
        accumulated_text = accumulated_text[:500000]
        yield json.dumps({"type": "progress", "message": f"Sending {len(accumulated_text)} characters of context to AI '{llm_config_id}' for taxonomy extraction..."})
        yield json.dumps({"type": "progress", "message": "Analyzing text and generating ontology classes... (This may take a minute)"})

        system_prompt = """
        You are an expert Ontologist. Your task is to analyze the provided text corpus and extract the fundamental entity types (Classes) that define the domain.
        Return ONLY a JSON object containing a list called 'classes', where each item has:
        - 'name' (Title Case, with spaces allowed)
        - 'description' (short definition)
        - 'source' (the filename where it was primarily found, using the --- Source: filename --- markers)
        - 'category' (a broad conceptual grouping, e.g., 'Business Context', 'Technical Infrastructure', 'Human Actors')
        
        Example Output:
        {
            "classes": [
                {"name": "Patient", "description": "A person receiving medical treatment.", "source": "medical_guidelines.txt", "category": "Human Actors"},
                {"name": "Clinical Trial", "description": "A research study testing a medical intervention.", "source": "trial_spec.pdf", "category": "Processes"}
            ]
        }
        """

        try:
            import asyncio
            task = asyncio.create_task(llm_service.chat_completion(
                system_prompt=system_prompt,
                user_prompt=f"Extract the taxonomy classes from the following text:\n\n{accumulated_text}",
                model=llm_config_id,
                json_mode=True
            ))
            
            while not task.done():
                done, pending = await asyncio.wait([task], timeout=15.0)
                if not done:
                    yield json.dumps({"type": "progress", "message": "Still analyzing... please wait."})
                    
            response_json_str = task.result()
            print(f"[OntologyService] LLM Raw Response: {response_json_str}")

            # The LLM Service has an internal extractor, but we can do a quick load here
            parsed_data = json.loads(llm_service._extract_json(response_json_str))
            classes = parsed_data.get("classes", [])
            print(f"[OntologyService] Returning {len(classes)} classes")
            
            yield json.dumps({"type": "progress", "message": f"Extraction complete! Found {len(classes)} classes."})
            yield json.dumps({"type": "result", "classes": classes})
            
        except Exception as e:
            import traceback
            print(f"[OntologyService] Taxonomy extraction failed: {e}")
            traceback.print_exc()
            yield json.dumps({"type": "progress", "message": f"Error during AI parsing: {e}"})
            yield json.dumps({"type": "result", "classes": []})

    async def extract_predicates_from_sources(self, sources: List[Dict], approved_classes: List[Dict], llm_config_id: str):
        """
        Scans provided sources and uses the approved classes to extract logical relationships (predicates).
        Yields real-time progress updates.
        """
        accumulated_text = ""
        total_sources = len(sources)
        
        yield json.dumps({"type": "progress", "message": f"Initializing predicate extraction from {total_sources} source(s)..."})
        
        for source in sources:
            source_type = source.get("type")
            path = source.get("config", {}).get("path")
            
            if source_type == "local" and path and os.path.exists(path):
                allowed_extensions = (".txt", ".md", ".csv", ".pdf", ".docx", ".pptx", ".xml", ".xlsx", ".html", ".htm")

                if os.path.isdir(path):
                    files = [f for f in os.listdir(path) if f.endswith(allowed_extensions)]
                    for filename in files:
                        filepath = os.path.join(path, filename)
                        yield json.dumps({"type": "progress", "message": f"Reading context from file: {filename}..."})
                        try:
                            content = document_parser.extract_text_from_file(filepath, char_limit=40000)
                            if content.strip():
                                accumulated_text += f"\n--- Source: {filename} ---\n{content}\n"
                        except Exception as e:
                            print(f"Skipping {filename}: {e}")
                elif os.path.isfile(path) and path.endswith(allowed_extensions):
                     yield json.dumps({"type": "progress", "message": f"Reading context from: {os.path.basename(path)}..."})
                     try:
                        content = document_parser.extract_text_from_file(path, char_limit=100000)
                        if content.strip():
                            accumulated_text += f"\n--- Source: {os.path.basename(path)} ---\n{content}\n"
                     except Exception as e:
                          print(f"Skipping {path}: {e}")
            
            elif source_type == "url":
                url = source.get("config", {}).get("url")
                depth = int(source.get("config", {}).get("max_depth") or 1)
                if url:
                    yield json.dumps({"type": "progress", "message": f"Crawling URL for context: {url} (depth={depth})..."})
                    try:
                        content = web_crawler_service.crawl_url(url, max_depth=depth)
                        if content.strip():
                            accumulated_text += content
                    except Exception as e:
                        yield json.dumps({"type": "progress", "message": f"Warning: Failed to crawl {url}."})

        if not accumulated_text.strip():
             yield json.dumps({"type": "progress", "message": "No text accumulated from sources!"})
             yield json.dumps({"type": "result", "edges": []})
             return

        # Cap the text to avoid context limits, bumped to 500k
        accumulated_text = accumulated_text[:500000]
        yield json.dumps({"type": "progress", "message": f"Sending {len(accumulated_text)} characters of context to AI '{llm_config_id}'..."})
        yield json.dumps({"type": "progress", "message": "Analyzing text to find logical relationships between the approved classes... (This may take a minute)"})

        # List of approved class names for the prompt
        class_names = [cls.get("name") for cls in approved_classes]
        
        system_prompt = f"""
        You are an expert Ontologist. Your task is to analyze the provided text corpus and identify the relationships (Predicates) between the following pre-approved entity classes:
        {json.dumps(class_names)}
        
        Return ONLY a JSON object containing a list called 'edges', where each item has:
        - 'source' (must be exactly one of the pre-approved classes)
        - 'target' (must be exactly one of the pre-approved classes)
        - 'relation' (Screaming_Snake_Case, e.g. HAS_DISEASE, WORKS_FOR, TREATS)
        - 'description' (short explanation of the relationship in this context)
        
        Only include relationships that are strongly supported by the text or are universally accepted facts within this domain.
        
        Example Output:
        {{
            "edges": [
                {{"source": "Patient", "target": "Clinical Trial", "relation": "ENROLLED_IN", "description": "A patient participates in a clinical trial."}},
                {{"source": "Doctor", "target": "Patient", "relation": "TREATS", "description": "A doctor provides medical care to a patient."}}
            ]
        }}
        """

        try:
            import asyncio
            task = asyncio.create_task(llm_service.chat_completion(
                system_prompt=system_prompt,
                user_prompt=f"Extract the relationships between the approved classes from the following text:\n\n{accumulated_text}",
                model=llm_config_id,
                json_mode=True
            ))
            
            while not task.done():
                done, pending = await asyncio.wait([task], timeout=15.0)
                if not done:
                    yield json.dumps({"type": "progress", "message": "Still analyzing relationships... please wait."})

            response_json_str = task.result()
            print(f"[OntologyService] Predicate LLM Raw Response: {response_json_str}")

            parsed_data = json.loads(llm_service._extract_json(response_json_str))
            edges = parsed_data.get("edges", [])
            print(f"[OntologyService] Returning {len(edges)} edges")
            
            yield json.dumps({"type": "progress", "message": f"Extraction complete! Found {len(edges)} relationships."})
            yield json.dumps({"type": "result", "edges": edges})
            
        except Exception as e:
            import traceback
            print(f"[OntologyService] Predicate extraction failed: {e}")
            traceback.print_exc()
            yield json.dumps({"type": "progress", "message": f"Error during AI parsing: {e}"})
            yield json.dumps({"type": "result", "edges": []})

    def get_ontology_tree(self, graph_id: str) -> Dict[str, Any]:
        """
        Retrieve the current ontology tree for a given graph_id from ArcadeDB.
        """
        nodes_query = f"SELECT * FROM NodeType" # In a real scenario we'd bind to graph_id if NodeType is graph specific
        edges_query = f"SELECT * FROM EdgeType"
        
        try:
            nodes_res = arcadedb.query(nodes_query)
            edges_res = arcadedb.query(edges_query)
            
            return {
                "nodes": nodes_res.get("result", []),
                "edges": edges_res.get("result", [])
            }
        except Exception as e:
            print(f"Error fetching ontology tree: {e}")
            return {"nodes": [], "edges": []}

    def import_ontology(self, graph_id: str, name: str, nodes: List[Dict], edges: List[Dict]) -> bool:
        """
        Imports the parsed ontology into ArcadeDB.
        """
        try:
            # 1. Create or update Ontology record
            arcadedb.command(
                "INSERT INTO Ontology SET graph_id = :g, name = :n, version = 1, status = 'ACTIVE', created_at = sysdate()",
                params={"g": graph_id, "n": name}
            )
            
            # 2. Insert NodeTypes
            for node in nodes:
                # Basic upsert logic
                try:
                    arcadedb.command(
                        "INSERT INTO NodeType SET id = :id, label = :l, description = :d, icon = :i, color = :c",
                        params={
                            "id": node.get("id"),
                            "l": node.get("label"),
                            "d": node.get("description", ""),
                            "i": node.get("icon", ""),
                            "c": node.get("color", "")
                        }
                    )
                except Exception as e:
                    print(f"NodeType insert error (might already exist): {e}")

            # 3. Insert EdgeTypes
            for edge in edges:
                try:
                     arcadedb.command(
                        "INSERT INTO EdgeType SET label = :l, constraints = :c",
                        params={
                            "l": edge.get("label"),
                            "c": json.dumps(edge.get("constraints", {}))
                        }
                    )
                except Exception as e:
                    print(f"EdgeType insert error: {e}")
                    
            return True
        except Exception as e:
            print(f"Import ontology failed: {e}")
            return False

ontology_service = OntologyService()
