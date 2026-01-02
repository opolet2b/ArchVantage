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
            chunk_size = int(rag_config.get("chunk_size", 1000))
            chunk_overlap = int(rag_config.get("chunk_overlap", 200))
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

            # 1.5. Configure LLM (for Metadata Extraction / Ingestion Pipeline)
            # We use the system's default LLM preset for this.
            default_llm = self.config_service.get_default_llm_preset()
            if default_llm:
                try:
                    llm_model_name = default_llm.get("model_name", "llama3")
                    if default_llm.get("type") == "remote":
                        # remote/OpenAI
                        api_key = default_llm.get("service_api_key") or default_llm.get("model_api_key")
                        Settings.llm = OpenAI(model=llm_model_name, api_key=api_key)
                        print(f"[RAGService] Configured LLM (OpenAI): {llm_model_name}")
                    else:
                        # local/Ollama
                        Settings.llm = Ollama(model=llm_model_name, base_url="http://localhost:11434")
                        print(f"[RAGService] Configured LLM (Ollama): {llm_model_name}")
                except Exception as e:
                    print(f"[RAGService] Error configuring LLM for RAG: {e}")
                    Settings.llm = None
            else:
                print("[RAGService] No default LLM preset found. Metadata extraction may fail or use defaults.")
                Settings.llm = None

            # 2. Configure Text Splitter / Node Parser
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
            Settings.embed_model = OllamaEmbedding(
                model_name=model_name,
                base_url="http://localhost:11434",
                ollama_additional_kwargs={"mirostat": 0}
            )
        except Exception as e:
            print(f"[RAGService] Failed to configure Ollama: {e}")
            # Fallback to local default?


    def ingest_file(self, file_path: str, conversation_id: Optional[str] = None, metadata: Optional[dict] = None, progress_callback=None):
        print(f"[RAGService] Starting ingestion for: {file_path}")
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
            
            return document_ingestor.ingest_document(
                file_path=file_path,
                index=self.index,
                storage_context=self.storage_context,
                conversation_id=conversation_id,
                metadata=metadata,
                progress_callback=progress_callback
            )

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
               self.index.insert_nodes(nodes)
               return {"status": "success", "count": len(nodes)}
            
            return {"status": "no_content"}
        except Exception as e:
            print(f"[RAGService] Error ingesting text: {e}")
            raise e



    # ... (skipping _configure_ollama)

    def ingest_file(self, file_path: str, conversation_id: Optional[str] = None, metadata: Optional[dict] = None, progress_callback=None):
        print(f"[RAGService] Starting ingestion for: {file_path}")
        try:
             # Check magic bytes... (omitted for brevity, assume unchanged or I need to keep it?)
             # I'm replacing the method? No, replacing CHUNKS.
             # I'll stick to targeted edits.
             pass
        except: pass
        
    # Wait, I need to target specific chunks. This replacement is messy if I don't see the full file.
    # I'll use separate replace calls.

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

    def reset_db(self):
        try:
            self.chroma_client.delete_collection("chatbot_rag")
            self.chroma_collection = self.chroma_client.create_collection("chatbot_rag")
            
            # Re-initialize index (using new settings if any)
            self._initialize_rag()
        except Exception as e:
            print(f"Error resetting DB: {e}")

rag_service = RAGService()
