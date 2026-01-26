# Node Postprocessors

Advanced filters applied *after* retrieval but *before* answering.

### Value
Retrieval is "fast but messy". Post-processing is "slow but smart". Using a Re-ranker is essentially a second opinion that sorts the retrieved documents to ensure the absolute best one is at the top.

### Options
- **Similarity Cutoff**: Filter by score.
- **Keyword Filter**: Require specific words.
- **Re-rankers (Cohere, SentenceTransformer)**: Use a powerful AI model to re-score documents. High acccuracy but higher latency.
