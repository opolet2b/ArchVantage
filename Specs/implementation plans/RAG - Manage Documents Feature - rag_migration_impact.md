# RAG Service Migration Impact: LangChain vs LlamaIndex

This document outlines the changes required to migrate `rag_service.py` from LangChain to LlamaIndex.

## Current Implementation (LangChain)

The current implementation uses LangChain's `RecursiveCharacterTextSplitter` for chunking and `Chroma` wrapper for vector storage.

```python
from langchain_community.vectorstores import Chroma
from langchain_openai import OpenAIEmbeddings
from langchain_community.document_loaders import PyPDFLoader, Docx2txtLoader, TextLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter

class RAGService:
    def __init__(self):
        self.persist_directory = "./chroma_db"
        self.embedding_function = FakeEmbeddings(size=1536) # Or OpenAIEmbeddings()
        self.vector_db = Chroma(
            persist_directory=self.persist_directory,
            embedding_function=self.embedding_function
        )
        self.text_splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=200)

    def ingest_file(self, file_path, conversation_id):
        # Load -> Split -> Add to VectorDB
        documents = self._load_file(file_path)
        # ... metadata handling ...
        splits = self.text_splitter.split_documents(documents)
        self.vector_db.add_documents(splits)

    def query(self, query_text, k=4, conversation_id=None):
        # Similarity Search
        results = self.vector_db.similarity_search(query_text, k=k, filter=filter_dict)
        return [doc.page_content for doc in results]
```

## Proposed Implementation (LlamaIndex)

The LlamaIndex implementation centers around `VectorStoreIndex` and `StorageContext`. It handles chunking and ingestion more implicitly but offers greater control over the indexing strategy.

**Key Changes:**
1.  **Imports**: Replace `langchain` imports with `llama_index` equivalents.
2.  **Initialization**: Setup `StorageContext` with Chroma and `VectorStoreIndex`.
3.  **Ingestion**: Use `SimpleDirectoryReader` (or specific file readers) and `index.insert()` or `index.from_documents()`.
4.  **Querying**: Use `index.as_query_engine()` or `index.as_retriever()`.

```python
import chromadb
from llama_index.core import VectorStoreIndex, SimpleDirectoryReader, StorageContext
from llama_index.vector_stores.chroma import ChromaVectorStore
from llama_index.embeddings.openai import OpenAIEmbedding
from llama_index.core import Settings

class RAGService:
    def __init__(self):
        self.persist_directory = "./chroma_db"
        
        # Global Settings (replaces individual component passing)
        Settings.embed_model = OpenAIEmbedding() # Or HuggingFaceEmbedding
        
        # Chroma Client Setup
        db = chromadb.PersistentClient(path=self.persist_directory)
        chroma_collection = db.get_or_create_collection("quickstart")
        vector_store = ChromaVectorStore(chroma_collection=chroma_collection)
        self.storage_context = StorageContext.from_defaults(vector_store=vector_store)
        
        # Load existing index or create empty
        self.index = VectorStoreIndex.from_vector_store(
            vector_store, storage_context=self.storage_context
        )

    def ingest_file(self, file_path, conversation_id):
        # LlamaIndex's SimpleDirectoryReader is very powerful
        documents = SimpleDirectoryReader(input_files=[file_path]).load_data()
        
        for doc in documents:
            doc.metadata["conversation_id"] = conversation_id
            doc.metadata["source"] = file_path

        # Insert into index (handles chunking automatically based on Settings)
        for doc in documents:
            self.index.insert(doc)
            
        return {"status": "success", "count": len(documents)}

    def query(self, query_text, k=4, conversation_id=None):
        # Create a retriever with filters
        filters = None
        if conversation_id:
            from llama_index.core.vector_stores import MetadataFilters, ExactMatchFilter
            filters = MetadataFilters(
                filters=[ExactMatchFilter(key="conversation_id", value=conversation_id)]
            )

        retriever = self.index.as_retriever(similarity_top_k=k, filters=filters)
        nodes = retriever.retrieve(query_text)
        return [node.get_content() for node in nodes]
```

## Impact Summary

| Feature | LangChain (Current) | LlamaIndex (Proposed) |
| :--- | :--- | :--- |
| **Complexity** | Low (Explicit steps) | Medium (More abstractions) |
| **Data Loading** | Manual loader selection (`PyPDFLoader` etc.) | `SimpleDirectoryReader` (Auto-detects) |
| **Chunking** | Explicit `TextSplitter` | Configurable global `Settings` |
| **Querying** | Direct `similarity_search` | `Retriever` or `QueryEngine` abstractions |
| **Dependencies** | `langchain-*` | `llama-index-*` |

**Conclusion:**
Switching to LlamaIndex simplifies data loading (auto-detection) and offers a more robust indexing pipeline for the future. However, it requires a complete rewrite of the `RAGService` class and changing the underlying dependencies. The logic for `list_documents`, `get_document_content`, and `delete_document` (file system operations) would remain largely the same, but the embedding deletion logic would need to adapt to LlamaIndex's API.
