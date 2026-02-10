# Parsing Strategy

The parsing strategy determines how your source documents are split into smaller chunks for processing and retrieval. Choosing the right strategy can significantly improve the quality of answers.

## Available Strategies

### Recursive (Standard)
Splits text recursively by separators (paragraphs, newlines, sentences) to keep related text together. 
**Best for:** Most general text documents where keeping semantic meaning intact is important.

### Token Splitter
Splits text purely based on token count, disregarding sentence boundaries.
**Best for:** When you need very precise control over chunk sizes (e.g., maximizing context window usage).

### Sentence Window
Splits text into sentences but includes surrounding sentences (the "window") as context for each chunk.
**Best for:** Specific fact retrieval where surrounding context is crucial for understanding.

### Semantic Splitter (AI-Driven)
Uses an embedding model to identify topic shifts and splits text accordingly.
**Best for:** Long documents with distinct sections or topics. **Note:** This is slower than other methods.

### Markdown
Respects markdown structure (headers, lists, code blocks).
**Best for:** .md files, technical documentation, or structured notes.

### Hierarchical (Auto-Merging)
Creates a tree of chunks (parent/child). Small child chunks are used for precise matching, but larger parent chunks are retrieved for context.
**Best for:** Complex documents where detailed answers require broad context.
