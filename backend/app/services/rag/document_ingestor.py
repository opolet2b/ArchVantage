import os
from typing import List, Optional, Dict, Any
from llama_index.core import Document, VectorStoreIndex, StorageContext
from llama_index.core import SimpleDirectoryReader

class DocumentIngestor:
    """
    Ingestor for standard documents (PDF, Docx, Text, etc).
    Supports progress reporting.
    """
    
    def __init__(self):
        pass

    def ingest_document(self, file_path: str, index: VectorStoreIndex, storage_context: StorageContext, conversation_id: Optional[str] = None, metadata: Optional[dict] = None, progress_callback=None, llm=None):
        """
        Ingest a document file.
        Supports .docx specific handling via MarkItDown.
        Args:
            llm: Optional LlamaIndex LLM instance for metadata extraction.
        """
        # ... (Start of function remains same, handled by context match) ...
        print(f"[DocumentIngestor] Starting ingestion for: {file_path}")
        
        is_docx = file_path.lower().endswith('.docx')
        
        # Word Document Handling
        if is_docx:
            from markitdown import MarkItDown
            import re
            
            md = MarkItDown()
            result = md.convert(file_path)
            text = result.text_content
            
            # Clean up base64 images from markdown to prevent context overflow
            # Pattern matches ![alt](data:image/...) and preserves alt text
            text = re.sub(
                r'!\[(.*?)\]\(data:image/[^)]+\)', 
                lambda m: f"[Image: {m.group(1)}]" if m.group(1) else "[Image]", 
                text
            )
            
            # Check for images to warn user
            try:
                import docx
                doc = docx.Document(file_path)
                has_images = False
                if len(doc.inline_shapes) > 0:
                     has_images = True
                else:
                    for rel in doc.part.rels.values():
                        if "image" in rel.reltype:
                            has_images = True
                            break
                if has_images:
                    warning_msg = (
                        "> [!WARNING]\n"
                        "> **Images Detected**: This document contains images or embedded objects which cannot be displayed here.\n"
                        "> To view this document with full visual fidelity, please **export it as a PDF** and import the PDF instead.\n\n"
                    )
                    text = warning_msg + text
            except Exception as e:
                print(f"[DocumentIngestor] Failed to check for images in docx: {e}")
            
            documents = [Document(text=text)]
            
        else:
            # Default handling (PDF, txt, etc) using SimpleDirectoryReader
            documents = SimpleDirectoryReader(input_files=[file_path]).load_data()
            
            # SANITIZATION: Fix "Metadata length" and "Type" errors from SimpleDirectoryReader
            if documents:
                for doc in documents:
                    # Create safe copy of keys to iterate
                    for key in list(doc.metadata.keys()):
                        val = doc.metadata[key]
                        
                        # 1. Remove complex types (lists, dicts) which break Vector Stores
                        if isinstance(val, (list, dict, set, tuple)):
                             del doc.metadata[key]
                             continue
                        
                        # 2. Remove None
                        if val is None:
                            del doc.metadata[key]
                            continue
                            
                        # 3. Truncate long strings (Metadata length error)
                        if isinstance(val, str) and len(val) > 400:
                             # Truncate and add ellipsis
                             doc.metadata[key] = val[:400] + "..."

        # Common metadata handling
        if documents:
            combined_text = ""
            # Pre-add metadata to documents before splitting
            for doc in documents:
                if metadata:
                    doc.metadata.update(metadata)
                doc.metadata["source"] = file_path
                doc.metadata["type"] = "document"
                if conversation_id:
                    doc.metadata["conversation_id"] = conversation_id
                
                # Exclude metadata from embedding/llm if needed
                doc.excluded_llm_metadata_keys = ["conversation_id", "source"]
                doc.excluded_embed_metadata_keys = ["conversation_id", "source"]
                if metadata:
                    doc.excluded_llm_metadata_keys.extend(metadata.keys())
                    doc.excluded_embed_metadata_keys.extend(metadata.keys())

                combined_text += doc.text + "\n\n"

            # Split / Extract Metadata
            from llama_index.core import Settings
            
            nodes = []
            enable_metadata = metadata.get("enable_metadata", False) if metadata else False
            
            if enable_metadata:
                try:
                    print("[DocumentIngestor] Metadata Extraction Enabled. Running IngestionPipeline...")
                    from llama_index.core.ingestion import IngestionPipeline
                    from llama_index.core.extractors import TitleExtractor, SummaryExtractor
                    
                    # Ensure LLM is available for extraction
                    # Priority: Explicit LLM > Global Settings.llm
                    active_llm = llm or Settings.llm
                    
                    if not active_llm:
                         print("[DocumentIngestor] Warning: Metadata extraction requested but no LLM configured. Skipping extraction.")
                         nodes = Settings.node_parser.get_nodes_from_documents(documents)
                    else:
                        pipeline = IngestionPipeline(
                            transformations=[
                                Settings.node_parser,
                                TitleExtractor(nodes=5, llm=active_llm),
                                SummaryExtractor(summaries=["prev", "self", "next"], llm=active_llm),
                            ]
                        )
                        nodes = pipeline.run(documents=documents)
                        print(f"[DocumentIngestor] Metadata extraction complete. Generated {len(nodes)} nodes.")
                except Exception as e:
                    print(f"[DocumentIngestor] Error in extraction pipeline: {e}. Fallback to standard splitting.")
                    nodes = Settings.node_parser.get_nodes_from_documents(documents)
            else:
                print(f"[DocumentIngestor] Splitting documents into nodes (Standard)...")
                # Use node_parser generic property to support both Splitters and WindowParsers
                nodes = Settings.node_parser.get_nodes_from_documents(documents)

            total_nodes = len(nodes)
            print(f"[DocumentIngestor] Created {total_nodes} nodes. Starting insertion...")
            
            for i, node in enumerate(nodes):
                index.insert_nodes([node])
                if progress_callback:
                    progress_callback(i + 1, total_nodes)
            
            print(f"[DocumentIngestor] Ingestion complete.")
            return {
                "status": "success", 
                "count": total_nodes,
                "full_text": combined_text.strip(),
                "text_length": len(combined_text.strip()),
                "doc_count": len(documents)
            }
        else:
            return {"status": "no_content", "full_text": ""}

document_ingestor = DocumentIngestor()
