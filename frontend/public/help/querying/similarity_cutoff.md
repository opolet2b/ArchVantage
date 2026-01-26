# Similarity Cutoff

A minimum score threshold (0.0 to 1.0) for retrieved documents.

### Pros
- **Quality Control**: Ensures the chatbot only answers if it finds *relevant* data. If no document meets the score, it will say "I don't know" instead of making things up.
- **Reduces Noise**: Filters out weakly related segments.

### Cons
- **Too High (e.g., 0.85+)**: might filter out useful but imperfect matches, causing the bot to return nothing.
- **Embedding Dependent**: The "correct" score varies wildly depending on the embedding model used.
