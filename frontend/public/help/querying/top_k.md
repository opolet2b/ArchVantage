# Retrieval Top K

Determines how many "chunks" of text are retrieved from the database for each query.

### Pros
- **Higher Values (10-20)**: Provides broad context, reducing the chance of missing key details. Great for "Research" tasks.
- **Lower Values (1-3)**: Faster, more focused. Good for specific fact lookup ("What is the IP address of server X?").

### Cons
- **Too High**: Can overwhelm the LLM with irrelevant noise (hallucinations) and increase costs/latency.
- **Too Low**: Might miss the answer entirely if it's split across multiple chunks.
