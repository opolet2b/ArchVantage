# Enable Citations

When enabled, the Analyzer will automatically identify key claims and information in its output and link them back to the source documents used for analysis.

## How it works
1. **Analysis**: The agent performs its analysis as usual.
2. **Verification**: After generating the result, the system searches the original source documents for text that matches the analysis findings.
3. **Linking**: Matches are attached as "Citations" at the bottom of the result.

## Benefits
- **Traceability**: Easily verify where information came from.
- **Trust**: Increases confidence in the AI's output.
- **Navigation**: Click a citation to jump directly to the source text.

> **Note**: Citations are generated based on semantic similarity using RAG (Retrieval-Augmented Generation). Always verify the source context.
