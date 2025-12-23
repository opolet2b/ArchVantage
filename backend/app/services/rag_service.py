import os
import shutil
from typing import List, Optional
import chromadb
from llama_index.core import VectorStoreIndex, SimpleDirectoryReader, StorageContext, Settings, Document
from llama_index.vector_stores.chroma import ChromaVectorStore
from llama_index.embeddings.huggingface import HuggingFaceEmbedding
from llama_index.core.node_parser import SentenceSplitter

class RAGService:
    def __init__(self):
        self.persist_directory = "./chroma_db"
        self._initialized = False
        
        try:
            # Configure Settings
            # Using HuggingFace local embeddings - no API key required
            # Using a small, fast model that runs locally
            Settings.embed_model = HuggingFaceEmbedding(
                model_name="sentence-transformers/all-MiniLM-L6-v2"
            )
            Settings.text_splitter = SentenceSplitter(chunk_size=1000, chunk_overlap=200)
            
            # Initialize Chroma Client
            self.chroma_client = chromadb.PersistentClient(path=self.persist_directory)
            self.chroma_collection = self.chroma_client.get_or_create_collection("chatbot_rag")
            
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

    def ingest_file(self, file_path: str, conversation_id: str):
        try:
            # LlamaIndex SimpleDirectoryReader handles various file types automatically
            documents = SimpleDirectoryReader(input_files=[file_path]).load_data()
            
            if documents:
                # Add metadata
                for doc in documents:
                    doc.metadata["conversation_id"] = conversation_id
                    doc.metadata["source"] = file_path
                    # Excluded metadata keys to avoid errors with some vector stores if needed
                    doc.excluded_llm_metadata_keys = ["conversation_id", "source"]
                    doc.excluded_embed_metadata_keys = ["conversation_id", "source"]

                # Insert into index
                # This handles chunking and embedding automatically
                for doc in documents:
                    self.index.insert(doc)
                
                return {"status": "success", "count": len(documents)}
            return {"status": "no_documents_found"}
        except Exception as e:
            print(f"Error ingesting file {file_path}: {e}")
            raise e

    def ingest_folder(self, folder_path: str, chunk_size: int = 1000, chunk_overlap: int = 200):
        # Not strictly needed for the current flow but good to keep
        try:
            # Configure splitting dynamically
            Settings.text_splitter = SentenceSplitter(chunk_size=chunk_size, chunk_overlap=chunk_overlap)
            
            documents = SimpleDirectoryReader(input_dir=folder_path, recursive=True).load_data()
            if documents:
                for doc in documents:
                    # We might not have conversation_id here easily unless passed
                    pass 
                
                # Delete existing documents from index to avoid duplicates if re-ingesting?
                # For now, just insert (LlamaIndex might handle dupes or we accept them)
                # Actually, clearing legacy "data" ingestion might be good, but risky if we mix with uploads.
                # Let's keep append behavior for now.
                
                for doc in documents:
                    self.index.insert(doc)
                return {"status": "success", "count": len(documents)}
            return {"status": "no_documents_found"}
        except Exception as e:
            print(f"Error ingesting folder {folder_path}: {e}")
            return {"status": "error", "detail": str(e)}

    def query(self, query_text: str, k: int = 4, conversation_id: Optional[str] = None):
        from llama_index.core.vector_stores import MetadataFilters, ExactMatchFilter
        
        filters = None
        if conversation_id:
            filters = MetadataFilters(
                filters=[ExactMatchFilter(key="conversation_id", value=conversation_id)]
            )

        # Create retriever
        retriever = self.index.as_retriever(similarity_top_k=k, filters=filters)
        nodes = retriever.retrieve(query_text)
        
        return [node.get_content() for node in nodes]

    def search(
        self,
        query: str,
        conversation_id: Optional[str] = None,
        k: int = 10
    ) -> List[dict]:
        """
        Search for relevant documents with metadata and scores.
        
        Unlike query() which returns only text content, this method
        returns structured results including metadata and relevance scores.
        
        Args:
            query: The search query text.
            conversation_id: Optional filter by conversation/collection ID.
            k: Number of results to return.
            
        Returns:
            List of dicts with 'text', 'metadata', and 'score' keys.
        """
        try:
            if not self._initialized or self.index is None:
                return []
            
            from llama_index.core.vector_stores import MetadataFilters, ExactMatchFilter
            
            filters = None
            if conversation_id:
                filters = MetadataFilters(
                    filters=[ExactMatchFilter(key="conversation_id", value=conversation_id)]
                )
            
            # Create retriever
            retriever = self.index.as_retriever(similarity_top_k=k, filters=filters)
            nodes = retriever.retrieve(query)
            
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
            
            # Re-initialize index
            self.vector_store = ChromaVectorStore(chroma_collection=self.chroma_collection)
            self.storage_context = StorageContext.from_defaults(vector_store=self.vector_store)
            self.index = VectorStoreIndex.from_vector_store(
                self.vector_store,
                storage_context=self.storage_context
            )
        except Exception as e:
            print(f"Error resetting DB: {e}")

rag_service = RAGService()
