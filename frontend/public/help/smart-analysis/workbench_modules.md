# Workbench Modules

The Logic Library contains four primary types of modules you can use to build your pipeline:

## 1. Data Extractor (Blue)
Extracts raw text or structured data from the source document. The purpose of this module is to focus the context provided to the AI. It extracts from source assets only the parts relevant for the template.
*   **Use for**: Pulling financial tables, specific clauses, or introduction text.
*   **Configuration**: Select the target document section (e.g., "Financials", "Entire Doc").

## 2. Analyzer (Purple)
The "brain" of the operation. Analyzes the extracted data using a specific persona and generates the analysis.
*   **Use for**: Risk assessment, compliance checks, summarization.
*   **Configuration**: Choose a Persona (e.g., Auditor) and a Framework (e.g., SWOT).

## 3. Visualizer (Pink)
Converts analysis results into visual formats.
*   **Use for**: Creating graphs, charts, simple text, or relationship diagrams.
*   **Configuration**: Select visualization type (Bar Chart, Mermaid Graph).

## 4. Formater (Red)
Formats the final result for export or display. This module creates the downloadable report.
*   **Use for**: Preparing the data for API response or downloadable report.
*   **Configuration**: JSON, Markdown, or CSV.
