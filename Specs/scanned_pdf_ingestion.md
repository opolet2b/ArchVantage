# Specification: Scanned PDF Ingestion via VLM

## 1. Overview
This feature adds support for checking if an uploaded PDF is a "scanned" document (image-based) or has poor text extraction quality, and if so, processes it using a Vision Language Model (VLM) instead of standard text extraction.

## 2. Methodology

### 2.1 Detection
The standard text extraction (using `PyPDF2` or `LlamaIndex`'s default loader) is currently used.
For this feature, we will detect "scanned" status by:
1.  Attempting standard text extraction.
2.  Descriptive metrics check: If the extracted text length is very low relative to file size or page count (heuristic: < 50 chars per page on average), treat as scanned.
3.  **Future/Advanced**: We could add a "Force OCR/VLM" checkbox in the UI, but for now we will use auto-detection or a fallback mechanism.

### 2.2 Processing Pipeline
1.  **PDF-to-Image Conversion**: Use `pypdfium2` (a robust, self-contained PDF renderer) to convert PDF pages to high-quality images.
2.  **VLM Analysis**: Iterate through each page image.
3.  **Prompt**: Send each image to the `VisionService` with a prompt: *"Transcribe the text on this page completely and describe any diagrams, charts, or images in detail."*
4.  **Aggregation**: Concatenate all page descriptions into a single text body.
5.  **Ingestion**: Send the combined text to `RAGService.ingest_text`.

### 2.3 Dependencies
-   `pypdfium2`: For rendering PDF pages to images. (Preferred over `pdf2image` on Windows to avoid strict Poppler dependency).

## 3. Architecture Changes

### Backend
-   `app/services/pdf_service.py` (New): specialized service for PDF handling (rendering, heuristic checks).
-   `app/routers/canvas_worker.py`: Update logic to attempt extraction, check quality, and failover to VLM.

### Frontend
-   No major changes, just status updates.

## 4. Configuration
-   Uses the same `vision_model` setting from the Canvas Store (passed via Thing content).
