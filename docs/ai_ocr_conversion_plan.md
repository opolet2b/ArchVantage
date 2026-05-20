# Implementation Plan: AI-Based OCR & Document Conversion Tool

## 1. Objective
Add a new Canvas Tool to the right-hand side panel that allows users to convert images or scanned PDFs into fully readable, single-file HTML documents. The user can then open this HTML file in their browser to read, print, or copy-paste into Word.

Based on technical constraints, the following architectural decisions have been made:
1. **Format Handling (Linearization)**: The tool will extract the text, tables, and lists clearly, but complex multi-column layouts will be linearized into a top-to-bottom reading flow.
2. **Image Preservation (Coordinate Cropping Approach)**: The Vision LLM will be prompted to identify images/charts and return bounding box coordinates. A backend processor using `Pillow` will automatically crop these areas from the original scan.
3. **HTML Output with Embedded Base64 Images (Zero Extra Dependencies)**: To avoid bloated libraries like `pypandoc`, the backend will generate a single HTML file. The cropped images will be embedded directly inside the HTML file as Base64 Data URIs, meaning the user only has to download a single self-contained `.html` file.
4. **Background Execution**: Due to the time required for LLM vision inference on multi-page documents, the processing will be executed as an asynchronous background job. The frontend will display real-time progress updates (e.g., "Processing page 2 of 10") and estimated time remaining.

## 2. Technical Stack & Libraries
*All libraries are already present in the project environment.*
- **Vision Models**: `backend/app/services/vision_service.py` (OpenAI/Ollama).
- **PDF Page Extraction**: `backend/app/services/pdf_service.py` (`pypdfium2`).
- **Image Cropping**: `Pillow`.
- **Markdown to HTML**: Standard Python `markdown` library.

## 3. Implementation Steps

### Phase 1: OCR & Cropping Service (`ocr_service.py`)
1. **Input Handling**:
   - Accept a file (Image or PDF) and a Job ID.
   - If PDF, use `pdf_service.convert_pdf_to_images` to split it into Base64 image frames.
2. **Vision Model Interaction**:
   - For each page, prompt `vision_service.analyze_image`: 
     *"Extract all text and tables using Markdown. If you see a photograph or chart, output a placeholder `[IMAGE: y1, x1, y2, x2]` where values are percentages of the bounding box."*
3. **Automated Image Cropping & Base64 Embedding**:
   - Parse the Markdown output for `[IMAGE: ...]` tags.
   - Use `Pillow` to load the original page image, crop the region using the percentage coordinates.
   - Convert the cropped image immediately into a Base64 Data URI (`data:image/jpeg;base64,...`).
   - Replace the tag in the Markdown with standard image syntax pointing to the URI: `![Extracted Image](data:image/jpeg;base64,...)`.
4. **HTML Generation**:
   - Combine all Markdown pages.
   - Convert Markdown to HTML.
   - Wrap the HTML in a clean, readable CSS template (e.g., readable fonts, table borders, centered images, max-width).

### Phase 2: Background Job & Progress Tracking
1. **Job Manager**:
   - Implement an in-memory job tracker (e.g., a dictionary of `job_id -> status`).
   - The job will update its progress after each page completes.
2. **API Endpoints**:
   - `POST /api/v1/tools/ocr/start`: Initiates the job, returns a `job_id`.
   - `GET /api/v1/tools/ocr/status/{job_id}`: Returns `status`, `progress` (0-100%), and `time_remaining_estimate`.
   - `GET /api/v1/tools/ocr/download/{job_id}`: Returns the generated `.html` file.

### Phase 3: Frontend Tool Integration
1. **Tool Registration**:
   - Register the OCR conversion tool in the Semantic Canvas environment (`ToolList`).
2. **User Interface**:
   - A modal/form to upload the document.
   - A progress view showing a **Progress Bar** and an **Estimated Time Left**.
   - A "Download HTML Document" button that appears upon completion.
