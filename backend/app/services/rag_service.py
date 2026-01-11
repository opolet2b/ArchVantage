import os
import shutil
from typing import List, Optional
import chromadb
from llama_index.core import VectorStoreIndex, SimpleDirectoryReader, StorageContext, Settings, Document
from llama_index.vector_stores.chroma import ChromaVectorStore
try:
    from llama_index.embeddings.ollama import OllamaEmbedding
except ImportError:
    OllamaEmbedding = None
    print("[RAGService] Warning: `llama-index-embeddings-ollama` not found. Embedding with Ollama will be disabled.")
from llama_index.core.node_parser import SentenceSplitter
# Import LLMs for Metadata Extraction (Soft dependency)
try:
    from llama_index.llms.ollama import Ollama
except ImportError:
    Ollama = None
    print("[RAGService] Warning: `llama-index-llms-ollama` not found. Metadata extraction with Ollama will be disabled.")

try:
    from llama_index.llms.openai import OpenAI
except ImportError:
    OpenAI = None
    print("[RAGService] Warning: `llama-index-llms-openai` not found. Metadata extraction with OpenAI will be disabled.")

class RAGService:
    def __init__(self):
        self.persist_directory = "./chroma_db"
        self._initialized = False
        self.chroma_client = None
        self.chroma_collection = None
        self.vector_store = None
        self.storage_context = None
        self.index = None
        
        from app.services.config_service import config_service
        self.config_service = config_service
        
        self._initialize_rag()

    def _initialize_rag(self):
        try:
            # Load RAG Config
            config = self.config_service.get_config()
            rag_config = config.get("rag_config", {})
            
            provider = rag_config.get("embedding_provider", "ollama")
            model = rag_config.get("embedding_model", "nomic-embed-text")
            parsing_strategy = rag_config.get("parsing_strategy", "recursive")
            chunk_size = int(rag_config.get("chunk_size", 512)) # Lower default to 512
            chunk_overlap = int(rag_config.get("chunk_overlap", 50))
            self.enable_metadata = rag_config.get("enable_metadata", False)
            
            print(f"[RAGService] Initializing with Provider={provider}, Model={model}, Strategy={parsing_strategy}")

            # 1. Configure Embedding Model
            if provider == "openai":
                try:
                    from llama_index.embeddings.openai import OpenAIEmbedding
                    api_key = rag_config.get("embedding_api_key")
                    if not api_key:
                        print("[RAGService] Warning: OpenAI provider selected but no API Key found.")
                    
                    Settings.embed_model = OpenAIEmbedding(
                        model=model,
                        api_key=api_key
                    )
                    print(f"[RAGService] Configured OpenAI Embedding: {model}")
                except ImportError:
                    print("[RAGService] Error: OpenAI provider selected but `llama-index-embeddings-openai` not installed. Falling back to Ollama.")
                    self._configure_ollama(model)
                except Exception as e:
                    print(f"[RAGService] Error configuring OpenAI: {e}. Falling back to Ollama.")
                    self._configure_ollama(model)
            else:
                 # Default to Ollama
                 self._configure_ollama(model)

            # 2. Configure Text Splitter / Node Parser
            if parsing_strategy == "window":
                from llama_index.core.node_parser import SentenceWindowNodeParser
                Settings.node_parser = SentenceWindowNodeParser.from_defaults(
                    window_size=3,
                    window_metadata_key="window",
                    original_text_metadata_key="original_text",
                )
                print("[RAGService] Configured SentenceWindowNodeParser")
                
            elif parsing_strategy == "token":
                from llama_index.core.node_parser import TokenTextSplitter
                Settings.text_splitter = TokenTextSplitter(chunk_size=chunk_size, chunk_overlap=chunk_overlap)
                Settings.node_parser = Settings.text_splitter
                print(f"[RAGService] Configured TokenTextSplitter (size={chunk_size}, overlap={chunk_overlap})")

            elif parsing_strategy == "markdown":
                from llama_index.core.node_parser import MarkdownNodeParser
                Settings.node_parser = MarkdownNodeParser()
                print("[RAGService] Configured MarkdownNodeParser")

            elif parsing_strategy == "hierarchical":
                from llama_index.core.node_parser import HierarchicalNodeParser
                # Use simplified derived chunk sizes
                Settings.node_parser = HierarchicalNodeParser.from_defaults(
                    chunk_sizes=[chunk_size*4, chunk_size*2, chunk_size]
                )
                print(f"[RAGService] Configured HierarchicalNodeParser (sizes={[chunk_size*4, chunk_size*2, chunk_size]})")

            elif parsing_strategy == "semantic":
                from llama_index.core.node_parser import SemanticSplitterNodeParser
                if Settings.embed_model:
                    Settings.node_parser = SemanticSplitterNodeParser(
                        buffer_size=1, 
                        breakpoint_percentile_threshold=95, 
                        embed_model=Settings.embed_model
                    )
                    print("[RAGService] Configured SemanticSplitterNodeParser")
                else:
                    print("[RAGService] Error: Semantic Splitter requires an embedding model. Falling back to SentenceSplitter.")
                    Settings.text_splitter = SentenceSplitter(chunk_size=chunk_size, chunk_overlap=chunk_overlap)
                    Settings.node_parser = Settings.text_splitter

            else:
                # Recursive / Default
                Settings.text_splitter = SentenceSplitter(chunk_size=chunk_size, chunk_overlap=chunk_overlap)
                Settings.node_parser = Settings.text_splitter # Explicitly set node parser too
                print(f"[RAGService] Configured SentenceSplitter (size={chunk_size}, overlap={chunk_overlap})")

            
            # Initialize Chroma Client
            # Use PersistentClient for data retention
            print(f"[RAGService] Initializing PersistentClient at {self.persist_directory}")
            self.chroma_client = chromadb.PersistentClient(path=self.persist_directory)
            
            # Collection name depends on embedding model to avoid dimension mismatches?
            # Or just use v2 and let user handle "reset" if they change models.
            # Plan said: enforce "Clear & Re-index".
            self.chroma_collection = self.chroma_client.get_or_create_collection("chatbot_rag_v2")
            
            # Set up Vector Store and Storage Context
            self.vector_store = ChromaVectorStore(chroma_collection=self.chroma_collection)
            self.storage_context = StorageContext.from_defaults(vector_store=self.vector_store)
            
            # Load index from storage if it exists, otherwise create empty
            try:
                self.index = VectorStoreIndex.from_vector_store(
                    self.vector_store,
                    storage_context=self.storage_context
                )
            except Exception:
                self.index = VectorStoreIndex.from_documents(
                    [], storage_context=self.storage_context
                )
            
            self._initialized = True
        except Exception as e:
            print(f"RAGService initialization failed: {e}")
            print("RAG features will be disabled.")
            self.chroma_client = None
            self.chroma_collection = None
            self.vector_store = None
            self.storage_context = None
            self.index = None

    def _configure_ollama(self, model_name):
        print(f"[RAGService] Connecting to Ollama for Embeddings (model: {model_name})...")
        try:
            # Conservative settings to prevent "cannot decode batches" and infinite retries
            # 1. Very small batch size (1) means we send one chunk at a time. Slower but stable.
            Settings.embed_batch_size = 1
            
            Settings.embed_model = OllamaEmbedding(
                model_name=model_name,
                base_url="http://localhost:11434",
                embed_batch_size=1,
                request_timeout=120.0,
                ollama_additional_kwargs={
                    "num_ctx": 8192, # Ensure context is large enough for chunks
                    "num_thread": 4  # Limit threads to prevent CPU starvation
                } 
            )
        except Exception as e:
            print(f"[RAGService] Failed to configure Ollama: {e}")
            # Fallback to local default?


    def create_llm_instance(self, model_name: str):
        """Create a LlamaIndex LLM instance for a specific model name."""
        try:
             if not model_name or model_name == "default":
                 return Settings.llm

             if "gpt" in model_name or "o1-" in model_name or "claude" in model_name:
                 # TODO: Better API Key handling for Anthropic/Others if needed
                 if OpenAI:
                     # Access config for key
                     config = self.config_service.get_config()
                     llm_config = config.get("llm_config", {})
                     api_key = llm_config.get("openai_api_key")
                     
                     # Map claude to OpenAI client? No, need Anthropic.
                     # For now, support OpenAI models + Ollama.
                     
                     return OpenAI(model=model_name, api_key=api_key)
            
             if "ollama" in model_name or "llama" in model_name or "mistral" in model_name:
                 if Ollama:
                      clean_name = model_name.replace("ollama/", "")
                      return Ollama(model=clean_name, base_url="http://localhost:11434")

             return Settings.llm
        except Exception as e:
            print(f"[RAGService] Error creating LLM instance for {model_name}: {e}")
            return Settings.llm

    def ingest_file(self, file_path: str, conversation_id: Optional[str] = None, metadata: Optional[dict] = None, progress_callback=None, model_name: Optional[str] = None, enable_vision: bool = True):
        print(f"[RAGService] Starting ingestion for: {file_path} (Model: {model_name}, Vision: {enable_vision})")
        try:
            # Check magic bytes for legacy OLE files first
            with open(file_path, 'rb') as f:
                header = f.read(8)
            is_ole = header.startswith(b'\xd0\xcf\x11\xe0')
            
            if is_ole:
                print(f"[RAGService] Detected binary OLE file (legacy .doc): {file_path}")
                return {"status": "error", "error": "Legacy .doc format detected. Please save as .docx and try again."}

            # Delegate to DocumentIngestor
            from app.services.rag.document_ingestor import document_ingestor
            
            # Resolve LLM
            llm_instance = self.create_llm_instance(model_name)
            
            result = document_ingestor.ingest_document(
                file_path=file_path,
                index=self.index,
                storage_context=self.storage_context,
                conversation_id=conversation_id,
                metadata=metadata,
                progress_callback=progress_callback,
                llm=llm_instance
            )
            
            # HYBRID VLM ENRICHMENT (Post-Text Ingestion)
            if enable_vision and result.get("status") == "success" and file_path.lower().endswith(".pdf"):
                try:
                    from app.services.pdf_service import pdf_service
                    
                    # 1. Identify visual pages
                    visual_pages = pdf_service.identify_visual_pages(file_path)
                    
                    if visual_pages:
                        print(f"[RAGService] Found {len(visual_pages)} visual pages. Triggering Hybrid VLM...")
                        from app.services.vision_service import vision_service
                        import asyncio
                        
                        # 2. Convert visual pages
                        images = pdf_service.convert_pdf_to_images(file_path, page_indices=visual_pages)
                        
                        hybrid_descriptions = []
                        # Use a small loop with timeout safeguard
                        for idx, (real_page_num, img_b64) in enumerate(zip(visual_pages, images)):
                            display_page = real_page_num + 1
                             
                            try:
                                prompt = f"Analyze the visual elements (charts, diagrams, graphs) on this page (Page {display_page}). Describe the data, trends, or visual content in detail. Do NOT transcribe text."
                                # We can't await easily if this function is sync?
                                # Wait, ingest_file is NOT async def. It is synchronous.
                                # But vision_service.analyze IS async.
                                # We need to run it synchronously.
                                
                                # Helper to run async in sync context
                                loop = asyncio.new_event_loop()
                                asyncio.set_event_loop(loop)
                                page_desc = loop.run_until_complete(vision_service.analyze(
                                     image_data=img_b64,
                                     prompt=prompt,
                                     model_name=model_name or "default" # Use passed model or default
                                ))
                                loop.close()
                                
                                hybrid_descriptions.append(f"--- Page {display_page} Visual Charts ---\n{page_desc}")
                                
                            except Exception as ve:
                                print(f"[RAGService] VLM Error Page {display_page}: {ve}")
                        
                        if hybrid_descriptions:
                            combined_visuals = "\n\n".join(hybrid_descriptions)
                            print(f"[RAGService] Ingesting {len(combined_visuals)} chars of Visual Context.")
                            
                            # Ingest Visual Context
                            v_meta = metadata.copy() if metadata else {}
                            v_meta.update({"type": "visual_context", "source": file_path, "conversation_id": conversation_id})
                            self.ingest_text(combined_visuals, metadata=v_meta)
                            
                            # Verification: Append to result for debug
                            result["visual_context_extracted"] = True
                            
                except Exception as he:
                    print(f"[RAGService] Hybrid VLM Failed: {he}")

            return result

        except Exception as e:
            print(f"Error ingesting file {file_path}: {e}")
            raise e

    def ingest_slideshow(self, file_path: str, conversation_id: Optional[str] = None, metadata: Optional[dict] = None, progress_callback=None):
        """
        Ingest a PowerPoint file using its pre-extracted JSON structure.
        Delegates to the specialized SlideshowIngestor.
        """
        try:
            from app.services.rag.slideshow_ingestor import slideshow_ingestor
            
            return slideshow_ingestor.ingest_slideshow(
                file_path=file_path,
                index=self.index,
                storage_context=self.storage_context,
                conversation_id=conversation_id,
                metadata=metadata,
                progress_callback=progress_callback
            )
        except Exception as e:
            print(f"[RAGService] Error ingesting slideshow: {e}")
            return {"status": "error", "error": str(e)}

    def ingest_text(self, text: str, metadata: Optional[dict] = None):
        """
        Ingest raw text directly into the index.
        Useful for image descriptions or other generated content.
        """
        try:
            # Create a Document object
            doc = Document(text=text, metadata=metadata or {})
            
            # Split into nodes
            nodes = Settings.text_splitter.get_nodes_from_documents([doc])
            
            if nodes:
               print(f"[RAGService] Ingesting {len(nodes)} nodes from text content.")
               try:
                   self.index.insert_nodes(nodes)
               except Exception as ie:
                   err_str = str(ie).lower()
                   if "connect" in err_str and "11434" in err_str:
                         raise Exception("RAG Embeddings Failed: Could not connect to Ollama (port 11434). Please ensure Ollama is running or configure a different Embedding Provider in Settings.")
                   raise ie
               return {"status": "success", "count": len(nodes)}
            
            return {"status": "no_content"}
        except Exception as e:
            print(f"[RAGService] Error ingesting text: {e}")
            raise e



    # ... (skipping _configure_ollama)



    def ingest_folder(self, folder_path: str, chunk_size: int = 1000, chunk_overlap: int = 200, metadata: Optional[dict] = None):
        """
        Ingest all files in a folder using the configured DocumentIngestor.
        Iterates files to ensure consistent handling (e.g. .docx processing).
        """
        try:
            print(f"[RAGService] Ingesting folder: {folder_path}")
            if not os.path.exists(folder_path):
                 return {"status": "error", "detail": "Folder not found"}

            count = 0
            errors = []
            
            # Walk directory
            for root, dirs, files in os.walk(folder_path):
                for file in files:
                    file_path = os.path.join(root, file)
                    
                    # Skip hidden files or non-content (e.g. .DS_Store)
                    if file.startswith("."):
                        continue
                        
                    # Prepare Metadata
                    file_metadata = metadata.copy() if metadata else {}
                    file_metadata["enable_metadata"] = self.enable_metadata
                    
                    try:
                        # Reuse ingest_file logic? Or calling ingestor directly?
                        # Using ingest_file ensures magic byte checks and routing.
                        res = self.ingest_file(file_path, metadata=file_metadata)
                        if res.get("status") == "success":
                            count += 1
                        elif res.get("status") == "error":
                            errors.append(f"{file}: {res.get('error')}")
                    except Exception as ie:
                         errors.append(f"{file}: {str(ie)}")

            return {
                "status": "success", 
                "count": count, 
                "errors": errors,
                "detail": f"Processed {count} files. Errors: {len(errors)}"
            }

        except Exception as e:
            print(f"Error ingesting folder {folder_path}: {e}")
            return {"status": "error", "detail": str(e)}

    def query(self, query_text: str, k: int = 4, conversation_id: Optional[str] = None, filters: Optional[dict] = None):
        from llama_index.core.vector_stores import MetadataFilters, ExactMatchFilter
        
        # Build filters
        metadata_filters = None
        filter_list = []
        
        # Legacy support for conversation_id arg
        if conversation_id:
            filter_list.append(ExactMatchFilter(key="conversation_id", value=conversation_id))
            
        # Generic filters
        if filters:
            for key, value in filters.items():
                filter_list.append(ExactMatchFilter(key=key, value=value))
                
        if filter_list:
            metadata_filters = MetadataFilters(filters=filter_list)

        # Create retriever
        retriever = self.index.as_retriever(similarity_top_k=k, filters=metadata_filters)
        nodes = retriever.retrieve(query_text)
        
        return [node.get_content() for node in nodes]

    def search(
        self,
        query: str,
        conversation_id: Optional[str] = None,
        filters: Optional[dict] = None,
        k: int = 10
    ) -> List[dict]:
        """
        Search for relevant documents with metadata and scores.
        
        Unlike query() which returns only text content, this method
        returns structured results including metadata and relevance scores.
        
        Args:
            query: The search query text.
            conversation_id: Optional filter by conversation/collection ID.
            filters: Optional dictionary of metadata filters (e.g. {"canvas_id": "123"})
            k: Number of results to return.
            
        Returns:
            List of dicts with 'text', 'metadata', and 'score' keys.
        """
        try:
            print(f"[RAGService] Search requested. Query: '{query}' Filters: {filters}")
            if not self._initialized or self.index is None:
                print(f"[RAGService] Index not initialized. Returning empty.")
                return []
            
            print(f"[RAGService] Building filters...")
            from llama_index.core.vector_stores import MetadataFilters, ExactMatchFilter
            
             # Build filters
            metadata_filters = None
            filter_list = []
            
            # Legacy support for conversation_id arg
            if conversation_id:
                filter_list.append(ExactMatchFilter(key="conversation_id", value=conversation_id))
                
            # Generic filters
            if filters:
                for key, value in filters.items():
                    filter_list.append(ExactMatchFilter(key=key, value=value))
                    
            if filter_list:
                metadata_filters = MetadataFilters(filters=filter_list)
            
            # Create retriever
            print(f"[RAGService] Creating retriever (k={k})...")
            retriever = self.index.as_retriever(similarity_top_k=k, filters=metadata_filters)
            
            print(f"[RAGService] Executing retrieve('{query}')...")
            nodes = retriever.retrieve(query)
            print(f"[RAGService] Retrieved {len(nodes)} nodes.")
            
            results = []
            for node in nodes:
                results.append({
                    "text": node.get_content(),
                    "metadata": node.metadata if hasattr(node, 'metadata') else {},
                    "score": node.score if hasattr(node, 'score') else 0.0
                })
            
            return results
        except Exception as e:
            print(f"RAG search error (returning empty): {e}")
            return []

    def delete_conversation_embeddings(self, conversation_id: str):
        try:
            # Delete directly from Chroma collection
            self.chroma_collection.delete(where={"conversation_id": conversation_id})
            return True
        except Exception as e:
            print(f"Error deleting embeddings for conversation {conversation_id}: {e}")
            return False

    def list_documents(self, conversation_id: str) -> List[str]:
        upload_dir = f"data/uploads/{conversation_id}"
        if not os.path.exists(upload_dir):
            return []
        return os.listdir(upload_dir)

    def get_document_content(self, conversation_id: str, filename: str) -> str:
        file_path = f"data/uploads/{conversation_id}/{filename}"
        if not os.path.exists(file_path):
            return "File not found"
        
        try:
            with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
                return f.read()
        except Exception as e:
            return f"Error reading file: {str(e)}"

    def delete_document(self, conversation_id: str, filename: str):
        file_path = f"data/uploads/{conversation_id}/{filename}"
        if os.path.exists(file_path):
            os.remove(file_path)
            
        try:
            # Delete from Chroma collection
            self.chroma_collection.delete(
                where={
                    "$and": [
                        {"conversation_id": conversation_id},
                        {"source": file_path}
                    ]
                }
            )
            return True
        except Exception as e:
            print(f"Error deleting embeddings for file {filename}: {e}")
            return False

    def delete_legacy_embeddings(self, thing_id: str, active_batch_id: str):
        """
        Deletes all embeddings for a given thing_id that do NOT match the active_batch_id.
        Used for 2-phase sync where new data is ingested with a new batch_id before old data is removed.
        """
        try:
            print(f"[RAGService] Cleaning up legacy embeddings for {thing_id} (keeping batch {active_batch_id})")
            # Note: logical operators in ChromaDB 'where' clause usually support $ne
            self.chroma_collection.delete(
                where={
                    "$and": [
                        {"thing_id": thing_id},
                        {"ingestion_batch_id": {"$ne": active_batch_id}}
                    ]
                }
            )
            return True
        except Exception as e:
            print(f"[RAGService] Error cleaning legacy embeddings: {e}")
            return False

    def reset_db(self):
        try:
            self.chroma_client.delete_collection("chatbot_rag")
            self.chroma_collection = self.chroma_client.create_collection("chatbot_rag")
            
            # Re-initialize index (using new settings if any)
            self._initialize_rag()
        except Exception as e:
            print(f"Error resetting DB: {e}")

rag_service = RAGService()
