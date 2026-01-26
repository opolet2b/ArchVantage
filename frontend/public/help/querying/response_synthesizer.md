# Response Synthesizer

How the final answer is constructed from the retrieved documents.

### Simple (Manual)
The default Chatbot mode. It pastes the documents into the prompt and asks the LLM to "Answer using context".
- **Pros**: Fast, conversational, maintains chat persona.
- **Cons**: Can't handle massive amounts of data (limited by context window).

### Tree Summarize
Recursively builds a summary tree from many documents.
- **Pros**: Can answer questions over 100+ documents by breaking them down.
- **Cons**: Very slow (multiple LLM calls). Result is often dry/informational.

### Refine
Iteratively updates the answer by reading one document at a time.
- **Pros**: extremely detailed.
- **Cons**: The slowest method.
