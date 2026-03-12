import os
import shutil
import threading
from typing import List, Optional, TYPE_CHECKING
# Defer heavy imports
if TYPE_CHECKING:
    import chromadb
    from llama_index.core import VectorStoreIndex, StorageContext, Settings
    from llama_index.vector_stores.chroma import ChromaVectorStore
    try:
        from llama_index.embeddings.ollama import OllamaEmbedding
    except ImportError:
        pass
from app.services.debug_service import debug_service

class RAGService:
    def __init__(self):
        from app.core.config import settings
        self.persist_directory = settings.CHROMA_DB_DIR
        self._initialized = False
        self.chroma_client = None
        self.chroma_collection = None
        self.vector_store = None
        self.storage_context = None
        self.index = None
        self.init_error = None
        
        # We do NOT initialize RAG here anymore. 
        # It must be called explicitly via initialize()

    def initialize(self, model_name: Optional[str] = None):
        """
        Lazy Initialization of RAG Service.
        Should be called automatically by public methods before use.
        """
        # If model_name is provided, we might need to re-sync Settings.llm
        # even if already initialized.
        if self._initialized and not model_name:
            return

        debug_service.log("INFO", "Knowledge Base", "RAG", "Initializing RAG Service (loading library)...")
        self.init_error = None
        
        try:
            from app.services.config_service import config_service
            self.config_service = config_service
            
            # Heavy Imports - Localized to avoid import-time lag for the whole app
            import chromadb
            from llama_index.core import VectorStoreIndex, StorageContext, Settings
            from llama_index.vector_stores.chroma import ChromaVectorStore
            from llama_index.core.node_parser import SentenceSplitter
            
            # Soft dependencies for metadata extraction
            try:
                from llama_index.llms.ollama import Ollama
            except ImportError:
                print("[RAGService] Warning: `llama-index-llms-ollama` not found. Metadata extraction with Ollama will be disabled.")

            try:
                from llama_index.llms.openai import OpenAI
            except ImportError:
                print("[RAGService] Warning: `llama-index-llms-openai` not found. Metadata extraction with OpenAI will be disabled.")


            # Load RAG Config
            config = self.config_service.get_config()
            rag_config = config.get("rag_config", {})
            self.querying_config = config.get("querying_config", {
                "similarity_top_k": 5,
                "similarity_cutoff": None,
                "retrieval_mode": "embedding",
                "postprocessor": "none",
                "postprocessor_config": {},
                "response_mode": "simple"
            })
            
            # --- Resolve Embedding Model from Preset (Priority) ---
            embedding_preset = self.config_service.get_default_embedding_preset()
            
            # Logic: Use provided model_name if available, else use default.
            if model_name:
                custom_preset = self.config_service.get_preset_config(model_name)
                llm_preset = custom_preset if custom_preset else self.config_service.get_default_llm_preset()
            else:
                llm_preset = self.config_service.get_default_llm_preset()
            
            # Sync LlamaIndex Global Settings with User Config
            if llm_preset:
                raw_window = llm_preset.get("context_window", 4096)
                # Apply safety buffer of 4000 tokens to account for tokenizer discrepancies
                window = max(2048, raw_window - 4000)
                print(f"[RAGService] Syncing Settings.context_window to {window} (raw: {raw_window}) from preset '{llm_preset['name']}'")
                Settings.context_window = window
                
                # Sync Global LLM for synthesis
                from app.services.llm_service import llm_service
                
                active_model = llm_preset["name"]
                
                # Check if Settings.llm is already set to this model to avoid redundant init
                current_llm = getattr(Settings, "llm", None)
                if current_llm and hasattr(current_llm, "model_name") and current_llm.model_name == active_model:
                     print(f"[RAGService] Settings.llm already set to '{active_model}'. Skipping re-sync.")
                else:
                     Settings.llm = llm_service._get_llama_index_model(active_model)
                     print(f"[RAGService] Syncing Settings.llm to model '{active_model}'")
            else:
                print(f"[RAGService] No LLM Preset found. Using default context_window/llm.")

            if embedding_preset:
                # Use Preset
                model = embedding_preset.get("model_name")
                preset_type = embedding_preset.get("type")
                
                if preset_type == "remote":
                    provider = "openai"
                    # Map Preset fields to RAG usage
                    api_key = embedding_preset.get("model_api_key") or embedding_preset.get("service_api_key")
                    api_base = embedding_preset.get("api_url")
                else:
                    provider = "ollama"
                    api_key = None
                    api_base = None
                    
                print(f"[RAGService] Using Default Embedding Preset: {embedding_preset.get('name')} ({provider}/{model})")
            else:
                # Try legacy rag_config but NO hardcoded defaults
                provider = rag_config.get("embedding_provider")
                model = rag_config.get("embedding_model")
                api_key = rag_config.get("embedding_api_key")
                api_base = None
                
                if not model:
                    msg = "CRITICAL: No default embedding model configured in presets or rag_config. Initialization aborted."
                    print(f"[RAGService] {msg}")
                    self.init_error = msg
                    self.index = None
                    return
                
                print(f"[RAGService] No Default Embedding Preset. Using configured legacy: {provider}/{model}")

            parsing_strategy = rag_config.get("parsing_strategy", "recursive")
            chunk_size = int(rag_config.get("chunk_size", 512)) # Lower default to 512
            chunk_overlap = int(rag_config.get("chunk_overlap", 50))
            self.enable_metadata = rag_config.get("enable_metadata", False)
            
            print(f"[RAGService] Initializing with Provider={provider}, Model={model}, Strategy={parsing_strategy}")

            # 1. Configure Embedding Model
            if provider == "openai":
                try:
                    from llama_index.embeddings.openai import OpenAIEmbedding
                    if not api_key:
                        print("[RAGService] Warning: OpenAI provider selected but no API Key found.")
                    
                    # specific args for OpenAI
                    embed_args = {
                        "model_name": model,
                    }
                    if api_key:
                        embed_args["api_key"] = api_key
                    if api_base:
                        embed_args["api_base"] = api_base
                        
                    Settings.embed_model = OpenAIEmbedding(**embed_args)
                    print(f"[RAGService] Configured OpenAI Embedding: {model}")
                except ImportError:
                    msg = "OpenAI provider selected but `llama-index-embeddings-openai` not installed."
                    print(f"[RAGService] Error: {msg}")
                    self.init_error = msg
                    self.index = None
                    return
                except Exception as e:
                    msg = f"Error configuring OpenAI Embedding: {str(e)}"
                    print(f"[RAGService] {msg}")
                    self.init_error = msg
                    self.index = None
                    return
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
            try:
                print(f"DEBUG: Initializing ChromaDB PersistentClient at {self.persist_directory}")
                self.chroma_client = chromadb.PersistentClient(path=self.persist_directory)
                print("DEBUG: ChromaDB Client successfully initialized.")
            except Exception as e:
                debug_service.log("ERROR", "Knowledge Base", "RAG", f"CRITICAL ERROR: Failed to initialize ChromaDB: {e}")
                
                # Attempt to recover from corruption
                if "tenant" in str(e).lower() or "sqlite" in str(e).lower() or "database" in str(e).lower():
                    print("[RAGService] Detected potential DB corruption. Attempting to recover...")
                    try:
                        import shutil
                        import time
                        
                        timestamp = int(time.time())
                        backup_path = f"{self.persist_directory}_corrupt_{timestamp}"
                        
                        if os.path.exists(self.persist_directory):
                            print(f"[RAGService] Renaming corrupt DB to {backup_path}")
                            try:
                                os.rename(self.persist_directory, backup_path)
                            except OSError:
                                print("[RAGService] Rename failed (likely locked). Attempting detailed cleanup...")
                                # Last ditch: try to ignore it and init client with new path? No, path is fixed.
                                # Just try to proceed, maybe it was a transient lock?
                                pass
                                
                        # Retry initialization completely
                        print("[RAGService] Retrying initialization with fresh DB...")
                        self.chroma_client = chromadb.PersistentClient(path=self.persist_directory)
                        self.chroma_collection = self.chroma_client.get_or_create_collection("chatbot_rag_v2")
                        print("[RAGService] Recovery successful. Fresh DB initialized.")
                        
                        # Set up Vector Store and Storage Context immediately to ensure consistent state
                        self.vector_store = ChromaVectorStore(chroma_collection=self.chroma_collection)
                        self.storage_context = StorageContext.from_defaults(vector_store=self.vector_store)
                        
                        # Re-create index immediately
                        self.index = VectorStoreIndex.from_documents([], storage_context=self.storage_context)
                        self._initialized = True
                        return

                    except Exception as recovery_err:
                        print(f"CRITICAL: Auto-recovery failed: {recovery_err}")
                        self.init_error = f"ChromaDB Recovery Failed: {recovery_err}"
                
                import traceback
                traceback.print_exc()
                self.chroma_client = None
                self.init_error = f"ChromaDB Initialization Exception: {str(e)}"
                self.index = None
                return
            
            # Collection name depends on embedding model to avoid dimension mismatches?
            # Or just use v2 and let user handle "reset" if they change models.
            # Plan said: enforce "Clear & Re-index".
            self.chroma_collection = self.chroma_client.get_or_create_collection("chatbot_rag_v2")
            
            # Diagnostic: Log dimension of existing/created collection
            try:
                # Access hidden _collection to check metadata/dim if needed, 
                # but simplest is just checking what it expects now.
                print(f"[RAGService] Collection '{self.chroma_collection.name}' initialized.")
            except: pass
            
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
            self.init_error = f"Initialization Exception: {str(e)}"
            print(f"RAGService initialization failed: {e}")
            print("RAG features will be disabled.")
            import traceback
            traceback.print_exc()
            self.chroma_client = None
            self.chroma_collection = None
            self.vector_store = None
            self.storage_context = None
            self.index = None

    def _get_postprocessors(self, config):
        """Factory for creating postprocessors based on config."""
        from llama_index.core.postprocessor import SimilarityPostprocessor, KeywordNodePostprocessor
        from llama_index.core import Settings
        
        processors = []
        name = config.get("postprocessor", "none")
        opts = config.get("postprocessor_config", {})
        
        # Always add Similarity Cutoff if configured globally
        if config.get("similarity_cutoff"):
            processors.append(SimilarityPostprocessor(similarity_cutoff=float(config["similarity_cutoff"])))
            
        if name == "none":
            pass
        elif name == "similarity_cutoff":
            # Already handled by global setting, but allows explicit selection
            pass
        elif name == "keyword":
            if opts.get("required_keywords"):
                processors.append(KeywordNodePostprocessor(
                    required_keywords=opts["required_keywords"].split(","),
                    exclude_keywords=opts.get("exclude_keywords", "").split(",") if opts.get("exclude_keywords") else None
                ))
        elif name == "cohere_rerank":
            try:
                from llama_index.postprocessor.cohere_rerank import CohereRerank
                processors.append(CohereRerank(
                    api_key=opts.get("api_key"),
                    top_n=opts.get("top_n", 5)
                ))
            except ImportError:
                print("[RAGService] Cohere Rerank not installed")
        elif name == "sentence_transformer":
            try:
                from llama_index.postprocessor.sentence_transformer import SentenceTransformerRerank
                processors.append(SentenceTransformerRerank(
                    model=opts.get("model", "cross-encoder/ms-marco-MiniLM-L-12-v2"),
                    top_n=opts.get("top_n", 5)
                ))
            except ImportError:
                 print("[RAGService] Sentence Transformer Rerank not installed")
        
        elif name == "metadata_replacement":
            try:
                from llama_index.core.postprocessor import MetadataReplacementPostProcessor
                processors.append(MetadataReplacementPostProcessor(
                    target_metadata_key=opts.get("target_keyword", "window")
                ))
            except ImportError as e:
                print(f"[RAGService] MetadataReplacement error: {e}")
                
        elif name == "long_context_reorder":
            try:
                from llama_index.core.postprocessor import LongContextReorder
                processors.append(LongContextReorder())
            except ImportError:
                 print("[RAGService] LongContextReorder not available")

        elif name == "sentence_embedding_optimizer":
            try:
                from llama_index.core.postprocessor import SentenceEmbeddingOptimizer
                processors.append(SentenceEmbeddingOptimizer(
                    threshold=float(opts.get("threshold", 0.7)),
                    percentile_cutoff=float(opts.get("percentile", 0.5)) if "percentile" in opts else None,
                    embed_model=Settings.embed_model
                ))
            except ImportError:
                print("[RAGService] SentenceEmbeddingOptimizer not available")
                
        elif name == "llm_rerank":
            try:
                from llama_index.core.postprocessor import LLMRerank
                processors.append(LLMRerank(
                    top_n=int(opts.get("top_n", 5)),
                    llm=Settings.llm # Uses currently configured LLM/Ollama
                ))
            except ImportError:
                print("[RAGService] LLMRerank not available")

        elif name == "jina_rerank":
            try:
                from llama_index.postprocessor.jinaai_rerank import JinaRerank
                processors.append(JinaRerank(
                    api_key=opts.get("api_key"),
                    top_n=int(opts.get("top_n", 5))
                ))
            except ImportError:
                print("[RAGService] JinaRerank not available. Install `llama-index-postprocessor-jinaai-rerank`")

        elif name == "colbert_rerank":
            try:
                from llama_index.postprocessor.colbert_rerank import ColbertRerank
                processors.append(ColbertRerank(
                    top_n=int(opts.get("top_n", 5)),
                    model=opts.get("model", "colbert-ir/colbertv2.0"),
                    tokenizer=opts.get("model", "colbert-ir/colbertv2.0"),
                    keep_retrieval_score=True
                ))
            except ImportError:
                print("[RAGService] ColbertRerank not available. Install `llama-index-postprocessor-colbert-rerank`")

        elif name == "rankllm_rerank":
            try:
                from llama_index.postprocessor.rankllm_rerank import RankLLMRerank
                processors.append(RankLLMRerank(
                    top_n=int(opts.get("top_n", 5)),
                    model=opts.get("model", "rank_zephyr_7b_v1_full") # or "rank_vicuna_7b_v1"
                ))
            except ImportError:
                 print("[RAGService] RankLLMRerank not available. Install `llama-index-postprocessor-rankllm-rerank`")

        elif name == "fixed_recency":
            try:
                from llama_index.core.postprocessor import FixedRecencyPostprocessor
                processors.append(FixedRecencyPostprocessor(
                    top_k=int(opts.get("top_k", 3)),
                    date_key=opts.get("date_key", "last_modified") # Metadata key to check
                ))
            except ImportError:
                print("[RAGService] FixedRecencyPostprocessor not available")
                
        elif name == "embedding_recency":
            try:
                from llama_index.core.postprocessor import EmbeddingRecencyPostprocessor
                processors.append(EmbeddingRecencyPostprocessor(
                    similarity_cutoff=float(opts.get("similarity_cutoff", 0.7)),
                    date_key=opts.get("date_key", "last_modified"),
                    embed_model=Settings.embed_model
                ))
            except ImportError:
                print("[RAGService] EmbeddingRecencyPostprocessor not available")
                
        elif name == "time_weighted":
            try:
                from llama_index.core.postprocessor import TimeWeightedPostprocessor
                processors.append(TimeWeightedPostprocessor(
                    time_decay=float(opts.get("time_decay", 0.99)),
                    time_access_refresh=bool(opts.get("time_access_refresh", True)),
                    top_k=int(opts.get("top_k", 3)),
                    date_key=opts.get("date_key", "last_modified")
                ))
            except ImportError:
                print("[RAGService] TimeWeightedPostprocessor not available")

        elif name == "prev_next":
            try:
                from llama_index.core.postprocessor import PrevNextNodePostprocessor
                # Need index for PrevNext
                if self.index:
                    processors.append(PrevNextNodePostprocessor(
                        docstore=self.index.docstore, 
                        num_nodes=int(opts.get("num_nodes", 1)),
                        mode=opts.get("mode", "both") # next, prev, both
                    ))
            except ImportError:
                print("[RAGService] PrevNextNodePostprocessor not available")

        return processors

    def _configure_ollama(self, model_name):
        print(f"[RAGService] Connecting to Ollama for Embeddings (model: {model_name})...")
        try:
            # Need to import locally
            from llama_index.embeddings.ollama import OllamaEmbedding
            from llama_index.core import Settings
            
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
            self.init_error = f"Ollama Configuration Failed: {e}"
            # Fallback to local default?


    def create_llm_instance(self, model_name: str):
        """Create a LlamaIndex LLM instance for a specific model name."""
        try:
             from app.services.llm_service import llm_service
             return llm_service._get_llama_index_model(model_name)
        except Exception as e:
            print(f"[RAGService] Error creating LLM instance for {model_name}: {e}")
            from llama_index.core import Settings
            return Settings.llm

    def ingest_file(self, file_path: str, conversation_id: Optional[str] = None, metadata: Optional[dict] = None, progress_callback=None, model_name: Optional[str] = None, vision_model_name: Optional[str] = None, enable_vision: bool = False):
        self.initialize(model_name=model_name)
        print(f"[RAGService] Starting ingestion for: {file_path} (Model: {model_name}, VisionModel: {vision_model_name}, Vision: {enable_vision})")
        
        # Ensure Initialized
        if not self._initialized:
             self.initialize()
        
        if self.index is None:
             error_msg = self.init_error or "RAG Service is not initialized. Please check your Embedding Model settings or API Key."
             print(f"[RAGService] Ingestion blocked: {error_msg}")
             return {"status": "error", "error": error_msg}

        # IDEMPOTENCY CHECK: Skip if file already in Chroma
        if self.is_file_ingested(file_path):
             print(f"[RAGService] Skipping ingestion: File already exists in index: {file_path}")
             return {"status": "success", "detail": "already_ingested"}

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
                                     model_name=vision_model_name or model_name or "default" # Use specific vision model, or fallback to LLM model, or default
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
        if not self._initialized:
             self.initialize()
             
        if self.index is None:
             return {"status": "error", "error": "RAG Service is not initialized."}

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
        self.initialize()
        """
        Ingest raw text directly into the index.
        Useful for image descriptions or other generated content.
        """
        if not self._initialized:
             self.initialize()
             
        if self.index is None:
             return {"status": "error", "error": "RAG Service is not initialized."}

        try:
            from llama_index.core import Document, Settings
            
            # Create a Document object
            doc = Document(text=text, metadata=metadata or {})
            
            # Split into nodes
            nodes = Settings.text_splitter.get_nodes_from_documents([doc])
            
            if nodes:
               print(f"[RAGService] Ingesting {len(nodes)} nodes from text content.")
               try:
                   for i, node in enumerate(nodes):
                       # OPTIMIZATION: Prevent LlamaIndex from storing the whole node content in metadata redundantly
                       # Chroma stores the text anyway in the document field.
                       node.excluded_embed_metadata_keys.append("_node_content")
                       node.excluded_llm_metadata_keys.append("_node_content")
                       
                       print(f"[RAGService] Embedding Text Node {i+1}/{len(nodes)}...")
                       self.index.insert_nodes([node])
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

    def query(self, query_text: str, k: int = 4, conversation_id: Optional[str] = None, filters: Optional[dict] = None, model_name: Optional[str] = None):
        try:
            self.initialize(model_name=model_name)
            if not self._initialized or not self.querying_config:
                return "RAG Service is not initialized or configured."
        except Exception as e:
            print(f"[RAGService] Error during query initialization: {e}")
            return [] # Or raise, depending on desired error handling

        # Check index again after init attempt
        if self.index is None:
            return []

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
        k: int = 10,
        response_mode: Optional[str] = None,
        model_name: Optional[str] = None
    ) -> List[dict]:
        """
        Search for relevant documents with metadata and scores.
        
        Unlike query() which returns only text content, this method
        returns structured results including metadata and relevance scores.
        """
        try:
            print(f"[RAGService] Search requested. Query: '{query}' Filters: {filters} (Model: {model_name})")
            
            self.initialize(model_name=model_name)
            
            if self.index is None:
                print(f"[RAGService] Index not initialized. Returning empty.")
                return []
            
            print(f"[RAGService] Building filters...")
            from llama_index.core.vector_stores import MetadataFilters, ExactMatchFilter
            
             # Build filters
            # Build filters
            metadata_filters = None
            filter_list = []
            
            # Legacy support for conversation_id arg
            if conversation_id:
                filter_list.append(ExactMatchFilter(key="conversation_id", value=conversation_id))
                
            # Generic filters (Enhanced with List Support)
            if filters:
                from llama_index.core.vector_stores import MetadataFilter, FilterOperator
                for key, value in filters.items():
                    if isinstance(value, list) and value:
                         # Use IN operator for lists
                         filter_list.append(MetadataFilter(key=key, value=value, operator=FilterOperator.IN))
                    else:
                         # Default to Exact Match
                         filter_list.append(ExactMatchFilter(key=key, value=value))
                    
            if filter_list:
                metadata_filters = MetadataFilters(filters=filter_list)
            
            # Create retriever
            # Apply configured top_k override if not explicitly passed
            effective_k = k
            if k == 10: # Default value meant "use config", whereas 3 is explicit
                 effective_k = int(self.querying_config.get("similarity_top_k", 5))
            
            print(f"[RAGService] Creating retriever (k={effective_k})...")
            retriever = self.index.as_retriever(similarity_top_k=effective_k, filters=metadata_filters)
            
            print(f"[RAGService] Executing retrieve('{query}')...")
            nodes = retriever.retrieve(query)
            print(f"[RAGService] Retrieved {len(nodes)} nodes BEFORE post-processing.")
            
            # Apply Postprocessors
            postprocessors = self._get_postprocessors(self.querying_config)
            if postprocessors:
                print(f"[RAGService] Applying {len(postprocessors)} postprocessors...")
                for pp in postprocessors:
                    nodes = pp.postprocess_nodes(nodes, query_str=query)
                print(f"[RAGService] {len(nodes)} nodes remaining AFTER post-processing.")
                
            # RESPONSE SYNTHESIS MODE
            # Use argument override OR global config
            active_response_mode = response_mode if response_mode else self.querying_config.get("response_mode", "simple")
            
            if active_response_mode in ["refine", "tree_summarize", "compact"] and len(nodes) > 0:
                 print(f"[RAGService] Synthesizing response with mode: {active_response_mode}")
                 from llama_index.core import get_response_synthesizer
                 
                 synthesizer = get_response_synthesizer(response_mode=active_response_mode)
                 response_obj = synthesizer.synthesize(query, nodes=nodes)
                 
                 # Return as a special "synthesized_answer" result
                 return [{
                     "text": str(response_obj),
                     "metadata": {"type": "synthesized_response", "mode": active_response_mode},
                     "score": 1.0
                 }]

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
        if not self._initialized:
            self.initialize()
            
        try:
            # Delete directly from Chroma collection
            if self.chroma_collection:
                self.chroma_collection.delete(where={"conversation_id": conversation_id})
                return True
            return False
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

    def delete_by_source(self, source_path: str):
        self.initialize()
        """
        Delete all embeddings associated with a specific source file path,
        regardless of conversation_id. This is used for Asset deletion.
        """
        if not self._initialized:
             self.initialize()
             
        try:
             # Sanitize path format if needed (Windows vs Linux)
             # ChromaDB stores exact string.
             print(f"[RAGService] Globally deleting embeddings for source: {source_path}")
             if self.chroma_collection:
                 self.chroma_collection.delete(
                     where={"source": source_path}
                 )
                 return True
             return False
        except Exception as e:
            print(f"[RAGService] Error deleting by source {source_path}: {e}")
            return False

    def delete_document(self, conversation_id: str, filename: str):
        file_path = f"data/uploads/{conversation_id}/{filename}"
        if os.path.exists(file_path):
            os.remove(file_path)
            
        try:
            if not self._initialized:
                self.initialize()

            # Delete from Chroma collection
            if self.chroma_collection:
                self.chroma_collection.delete(
                    where={
                        "$and": [
                            {"conversation_id": conversation_id},
                            {"source": file_path}
                        ]
                    }
                )
                return True
            return False
        except Exception as e:
            print(f"Error deleting embeddings for file {filename}: {e}")
            return False

    def delete_legacy_embeddings(self, thing_id: str, active_batch_id: str):
        """
        Deletes all embeddings for a given thing_id that do NOT match the active_batch_id.
        Used for 2-phase sync where new data is ingested with a new batch_id before old data is removed.
        """
        if not self._initialized:
             self.initialize()
             
        try:
            print(f"[RAGService] Cleaning up legacy embeddings for {thing_id} (keeping batch {active_batch_id})")
            if self.chroma_collection:
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
            return False
        except Exception as e:
            print(f"[RAGService] Error cleaning legacy embeddings: {e}")
            return False

    def delete_by_canvas(self, canvas_id: str):
        self.initialize()
        """Delete all embeddings associated with a specific canvas."""
        if not self._initialized:
             self.initialize()
        try:
            if self.chroma_collection:
                print(f"[RAGService] Deleting all embeddings for canvas: {canvas_id}")
                self.chroma_collection.delete(where={"canvas_id": canvas_id})
                return True
            return False
        except Exception as e:
            print(f"[RAGService] Error deleting by canvas {canvas_id}: {e}")
            return False

    def delete_ontology_embeddings(self, kb_id: str):
        """Delete all ontology class embeddings for a specific KB."""
        self.initialize()
        try:
            if self.chroma_collection:
                print(f"[RAGService] Deleting existing ontology embeddings for KB: {kb_id}")
                self.chroma_collection.delete(
                    where={
                        "$and": [
                            {"kb_id": kb_id},
                            {"type": "ontology_class"}
                        ]
                    }
                )
                return True
            return False
        except Exception as e:
            print(f"[RAGService] Error deleting ontology embeddings for {kb_id}: {e}")
            return False

    def delete_by_thing(self, thing_id: str):
        self.initialize()
        """Delete all embeddings associated with a specific thing."""
        if not self._initialized:
             self.initialize()
        try:
            if self.chroma_collection:
                print(f"[RAGService] Deleting all embeddings for thing: {thing_id}")
                self.chroma_collection.delete(where={"thing_id": thing_id})
                return True
            return False
        except Exception as e:
            print(f"[RAGService] Error deleting by thing {thing_id}: {e}")
            return False

    def reset_db(self):
        try:
            print("[RAGService] Resetting Vector Database...")
            if not self._initialized:
                 self.initialize()

            # Use the same collection name as initialization
            if self.chroma_client:
                self.chroma_client.delete_collection("chatbot_rag_v2")
                self.chroma_collection = self.chroma_client.get_or_create_collection("chatbot_rag_v2")
             
                # Re-initialize index (using new settings if any)
                self._initialize_rag() # Re-use internal init logic if separated?
                # Actually, wait. initialize() is now the main entry.
                # If we reset DB, we might want to re-run config loading.
                # Let's just call initialize() again to be safe and ensure all objects are fresh.
                self._initialized = False 
                self.initialize()
                
            print("[RAGService] Database reset complete.")
        except Exception as e:
            print(f"Error resetting DB: {e}")

    def update_embedding_model(self, preset_name: str, reset_db: bool = False):
        """
        Updates the embedding model based on the new preset.
        If reset_db is True, clears vector store and re-indexes.
        Otherwise, attempts hot-reload (experimental for compatible dimensions).
        """
        print(f"[RAGService] Updating embedding model to preset: {preset_name} (Reset DB: {reset_db})")
        if reset_db:
            self.reset_db()
        else:
            self.reload_config()

    def reload_config(self):
        """Re-initializes RAG components with latest config without resetting data."""
        print("[RAGService] Reloading configuration...")
        self._initialized = False # Force re-init
        self.initialize()

    def is_file_ingested(self, file_path: str) -> bool:
        """Check if a file has already been ingested into the current collection."""
        if not self._initialized:
            self.initialize()
            
        if not self.chroma_collection:
            return False
            
        try:
            # Query by source metadata
            results = self.chroma_collection.get(
                where={"source": file_path},
                limit=1,
                include=["metadatas"]
            )
            return len(results.get("ids", [])) > 0
        except Exception as e:
            print(f"[RAGService] Error checking ingestion status for {file_path}: {e}")
            return False

    def clear_database_cache(self):
        """Force a VACUUM on the underlying SQLite database to reclaim space."""
        import sqlite3
        db_file = os.path.join(self.persist_directory, "chroma.sqlite3")
        if os.path.exists(db_file):
             print(f"[RAGService] Performing VACUUM on {db_file}...")
             try:
                 conn = sqlite3.connect(db_file)
                 conn.execute("VACUUM;")
                 conn.close()
                 print("[RAGService] VACUUM complete.")
             except Exception as e:
                 print(f"[RAGService] VACUUM failed: {e}")

rag_service = RAGService()
