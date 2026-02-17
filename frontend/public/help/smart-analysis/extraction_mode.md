# Extraction Mode

The **Extraction Mode** determines how the AI extracts information from source documents.

## Modes

### 1. Semantic Analysis (Default)
Analyzes and filters information based on meaning.
- **Best for:** Summaries, complex analysis, and answering open-ended questions.
- **Pros:** Can connect dots and provide deeper insights.
- **Cons:** Slightly higher risk of hallucination if source is ambiguous.

### 2. Table / Structure
Strictly transcribes tabular data row-by-row.
- **Best for:** Creating datasets, spreadsheets, or database entries.
- **Pros:** Machine-readable, consistent formatting.
- **Cons:** Requires a well-defined schema or specific instructions.

### 3. OCR / Verbatim
Extracts raw text exactly as it appears.
- **Best for:** Quotes, specific data points, and factual retrieval.
- **Pros:** High accuracy, low hallucination risk.
- **Cons:** May miss context or implied information.

### 4. Raw / Pass-Through (No AI)
Passes selection directly to the next step without any processing.
- **Best for:** Creating a pipeline where the first step is just a filter.
- **Pros:** Fast, no cost.
- **Cons:** No intelligence applied.
