# Knowledge Base Analysis Testing Guide

This guide provides concrete methods to verify that the Knowledge Base (KB) is correctly analyzing and retrieving content during Smart Analysis or Chat operations.

## Method 1: The "Unique Token" Injection Test (Recommended)

This is the most definitive way to prove the AI is reading your KB content.

1.  **Prepare a test document**: Create a simple `.txt` or `.md` file with a unique, non-existent word.
    *   *Example Content*: "The secret password for the Antigravity project is `XJ-99-SKYFALL`."
2.  **Upload to KB**:
    *   Go to your KB configuration.
    *   Upload this file.
    *   Wait for the ingestion status to show "Completed".
3.  **Ask the AI**:
    *   Open a Chat or a Smart Template linked to **that specific KB**.
    *   Ask: "What is the secret password for the Antigravity project?"
4.  **Verify**:
    *   If the AI answers `XJ-99-SKYFALL`, the ingestion, retrieval, and analysis are working perfectly.

## Method 2: Direct API Query Verification

You can bypass the UI to see exactly what the RAG engine thinks is relevant.

1.  **Use the RAG Query Endpoint**:
    *   Send a `POST` request to `/api/v1/rag/query`.
    *   **Body**:
        ```json
        {
          "query": "Your search term",
          "k": 5
        }
        ```
2.  **Check Output**: If the returned `results` list contains text snippets from your documents, the Vector DB (ChromaDB) is correctly populated.

## Method 3: Backend Log Monitoring

If you have access to the backend terminal/logs, watch for these specific tags:

*   `[RAGService] Initializing RAG Service...`: Confirms the engine is starting up.
*   `[ContextEnrichment] Searching KB <id> for keywords: [...]`: Shows what terms the AI is searching for in your KB.
*   `[ContextEnrichment] Found X matching KB nodes.`: Confirms that entities were found in the graph.
*   `[RAGService] Ingesting X nodes from text content.`: Shows that your files are being broken down and stored.

## Troubleshooting Common Issues

*   **Wrong KB selected**: Ensure the Canvas or Template has the correct KB ID selected in the dropdown.
*   **Ingestion Lag**: Large files or many files can take a few minutes to process (especially if using local Ollama for embeddings). Check the "Knowledge" tab to see if entities appear in the graph.
*   **Context Window**: If the "Primary Subject" (your selected canvas nodes) is very large, it might crowd out the KB context. Try selecting fewer nodes for a cleaner test.
