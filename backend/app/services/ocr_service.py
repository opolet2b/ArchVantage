import uuid
import asyncio
import base64
import io
import re
import time
from typing import Dict, Any
from PIL import Image
import markdown2

from app.services.vision_service import vision_service
from app.services.pdf_service import pdf_service

class OCRService:
    """
    Service for handling AI-powered OCR and document conversion.
    Manages background jobs for converting PDFs and images to structured HTML.
    """
    def __init__(self):
        # In-memory job store: {job_id: {"status": "pending|processing|completed|error", "progress": 0-100, "result": html_string, "error": msg}}
        self.jobs: Dict[str, Dict[str, Any]] = {}

    def start_job(self, file_bytes: bytes, filename: str, vlm_config: str = None) -> str:
        """
        Initiates a background OCR conversion job.

        Args:
            file_bytes: Raw bytes of the uploaded file.
            filename: Original name of the file (used to determine extension).
            vlm_config: Optional specific model configuration name.

        Returns:
            A unique job ID (UUID string).
        """
        job_id = str(uuid.uuid4())
        self.jobs[job_id] = {
            "status": "pending",
            "progress": 0,
            "result": None,
            "error": None,
            "vlm_config": vlm_config
        }
        asyncio.create_task(self._process_document(job_id, file_bytes, filename, vlm_config))
        return job_id

    def get_job_status(self, job_id: str) -> Dict[str, Any]:
        """
        Retrieves the current status and progress of a job.

        Args:
            job_id: The ID of the job to check.

        Returns:
            A dictionary containing status, progress, and optionally result or error.
        """
        job = self.jobs.get(job_id)
        if not job:
            return {"status": "error", "error": "Job not found"}
        return job

    async def _process_document(self, job_id: str, file_bytes: bytes, filename: str, vlm_config: str = None):
        """
        Internal worker that handles the multi-stage conversion process.
        1. Splitting PDF/Image into pages.
        2. Vision LLM inference per page.
        3. Dynamic image cropping.
        4. Markdown to HTML conversion.
        """
        try:
            self.jobs[job_id]["status"] = "processing"
            self.jobs[job_id]["start_time"] = time.time()
            
            images_b64 = []
            
            if filename.lower().endswith('.pdf'):
                # Save temp pdf to use pdf_service
                import tempfile
                import os
                with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp:
                    tmp.write(file_bytes)
                    tmp_path = tmp.name
                
                try:
                    images_b64 = pdf_service.convert_pdf_to_images(tmp_path)
                finally:
                    try:
                        os.unlink(tmp_path)
                    except Exception as e:
                        print(f"[OCRService] Warning: Could not delete temp file {tmp_path}: {e}")
            else:
                # Assume it's an image file
                images_b64 = [base64.b64encode(file_bytes).decode('utf-8')]
            
            if not images_b64:
                raise Exception("No images could be extracted from the document.")

            total_pages = len(images_b64)
            self.jobs[job_id]["total_pages"] = total_pages
            all_markdown = []

            for idx, img_b64 in enumerate(images_b64):
                self.jobs[job_id]["current_page"] = idx + 1
                prompt = (
                    "You are a precise document transcription AI. "
                    "Extract all text, tables, and lists from this document page perfectly, maintaining reading order and structure. "
                    "Output the result in Markdown format. "
                    "IMPORTANT: If you see a photograph, chart, diagram, or significant illustration, you MUST provide its exact bounding box. "
                    "Use this format: [IMAGE: y_start, x_start, y_end, x_end] "
                    "Coordinates must be normalized integers from 0 to 1000, where (0,0) is top-left and (1000,1000) is bottom-right. "
                    "Ensure the box strictly contains the visual element and a small margin (5-10 units) of the surrounding white space. "
                    "Do NOT output [IMAGE: ...] for purely decorative lines, simple icons, or tiny logos."
                )
                
                # Analyze image with Vision model
                md_output = await vision_service.analyze(
                    image_data=f"data:image/jpeg;base64,{img_b64}",
                    prompt=prompt,
                    model_name=vlm_config or "default"
                )

                # Process the [IMAGE: ...] placeholders
                processed_md = self._crop_and_replace_images(md_output, img_b64)
                all_markdown.append(f"<!-- Page {idx + 1} -->\n{processed_md}")
                
                # Update progress
                progress = int(((idx + 1) / total_pages) * 100)
                self.jobs[job_id]["progress"] = progress

            # Combine all markdown
            final_markdown = "\n\n---\n\n".join(all_markdown)
            
            # Convert to HTML
            # Using extras that help with complex layouts
            html_content = markdown2.markdown(
                final_markdown, 
                extras=["tables", "fenced-code-blocks", "break-on-newline", "header-ids", "cuddled-lists"]
            )
            
            # Wrap in template
            final_html = self._wrap_in_template(html_content, filename)
            
            self.jobs[job_id]["status"] = "completed"
            self.jobs[job_id]["result"] = final_html
            self.jobs[job_id]["progress"] = 100

        except Exception as e:
            print(f"[OCRService] Error processing job {job_id}: {e}")
            import traceback
            traceback.print_exc()
            self.jobs[job_id]["status"] = "error"
            self.jobs[job_id]["error"] = str(e)

    def _crop_and_replace_images(self, markdown_text: str, original_b64: str) -> str:
        """
        Parses AI-generated Markdown for [IMAGE: coords] placeholders and
        replaces them with HTML <img> tags with Base64-encoded crops.
        """
        # Regex to find [IMAGE: y1, x1, y2, x2]
        pattern = r"\[IMAGE:\s*(\d+(?:\.\d+)?),\s*(\d+(?:\.\d+)?),\s*(\d+(?:\.\d+)?),\s*(\d+(?:\.\d+)?)\]"
        
        def replacer(match):
            try:
                y1, x1, y2, x2 = map(float, match.groups())
                
                # Auto-fix reversed coordinates if the AI flipped them
                start_y, end_y = min(y1, y2), max(y1, y2)
                start_x, end_x = min(x1, x2), max(x1, x2)

                # Decode original image
                img_data = base64.b64decode(original_b64)
                img = Image.open(io.BytesIO(img_data))
                width, height = img.size
                
                # Add a 2% safety padding (in 0-1000 scale, that's 20 units)
                padding = 20
                start_y = max(0, start_y - padding)
                start_x = max(0, start_x - padding)
                end_y = min(1000, end_y + padding)
                end_x = min(1000, end_x + padding)

                # Calculate pixel coordinates
                px1 = int((start_x / 1000.0) * width)
                py1 = int((start_y / 1000.0) * height)
                px2 = int((end_x / 1000.0) * width)
                py2 = int((end_y / 1000.0) * height)
                
                # Discard crops that are too small (less than 10x10 pixels or 1% of page)
                if (px2 - px1) < 10 or (py2 - py1) < 10:
                    return "<!-- Skipped microscopic crop -->"
                
                # Ensure coordinates are within bounds
                px1, py1 = max(0, px1), max(0, py1)
                px2, py2 = min(width, px2), min(height, py2)

                cropped = img.crop((px1, py1, px2, py2))
                
                # Convert crop back to base64
                buf = io.BytesIO()
                cropped.save(buf, format="JPEG", quality=85)
                crop_b64 = base64.b64encode(buf.getvalue()).decode('utf-8')
                
                # We return raw HTML here to ensure it's not broken by markdown parser
                return f'<div class="extracted-image-wrapper"><img src="data:image/jpeg;base64,{crop_b64}" alt="Extracted Document Content" /><p class="image-caption">Extracted visual content</p></div>'
            except Exception as e:
                print(f"[OCRService] Error cropping image: {e}")
                return "<!-- Error extracting image -->"

        return re.sub(pattern, replacer, markdown_text)

    def _wrap_in_template(self, body_html: str, title: str) -> str:
        """
        Wraps extracted HTML content in a self-contained document with premium CSS.
        """
        return f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Extracted: {title}</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Outfit:wght@400;600;800&display=swap" rel="stylesheet">
    <style>
        :root {{
            --primary: #2563eb;
            --primary-light: #eff6ff;
            --text-main: #1e293b;
            --text-muted: #64748b;
            --bg-page: #f8fafc;
            --bg-card: #ffffff;
            --border: #e2e8f0;
            --shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
        }}

        * {{
            box-sizing: border-box;
            -webkit-font-smoothing: antialiased;
        }}

        body {{
            font-family: 'Inter', system-ui, -apple-system, sans-serif;
            line-height: 1.7;
            color: var(--text-main);
            background-color: var(--bg-page);
            margin: 0;
            padding: 3rem 1rem;
        }}

        .document-wrapper {{
            max-width: 850px;
            margin: 0 auto;
        }}

        header {{
            margin-bottom: 3rem;
            text-align: center;
        }}

        .badge {{
            display: inline-block;
            background: var(--primary-light);
            color: var(--primary);
            padding: 0.25rem 0.75rem;
            border-radius: 9999px;
            font-size: 0.75rem;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            margin-bottom: 1rem;
        }}

        h1.doc-title {{
            font-family: 'Outfit', sans-serif;
            font-size: 2.5rem;
            font-weight: 800;
            color: #0f172a;
            margin: 0;
            line-height: 1.2;
        }}

        .meta-info {{
            margin-top: 1rem;
            color: var(--text-muted);
            font-size: 0.875rem;
        }}

        .document-container {{
            background: var(--bg-card);
            padding: 4rem;
            border-radius: 1.5rem;
            box-shadow: var(--shadow);
            border: 1px solid var(--border);
        }}

        /* Content Styling */
        h1, h2, h3, h4 {{
            font-family: 'Outfit', sans-serif;
            color: #0f172a;
            margin-top: 2.5rem;
            margin-bottom: 1rem;
        }}

        h1 {{ font-size: 2rem; border-bottom: 2px solid var(--primary-light); padding-bottom: 0.5rem; }}
        h2 {{ font-size: 1.5rem; }}
        h3 {{ font-size: 1.25rem; }}

        p {{
            margin-bottom: 1.5rem;
        }}

        .extracted-image-wrapper {{
            margin: 2.5rem -2rem;
            background: #f1f5f9;
            padding: 1rem;
            border-radius: 1rem;
            text-align: center;
        }}

        .extracted-image-wrapper img {{
            max-width: 100%;
            height: auto;
            border-radius: 0.5rem;
            box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
        }}

        .image-caption {{
            font-size: 0.75rem;
            color: var(--text-muted);
            margin-top: 0.75rem;
            margin-bottom: 0;
            font-style: italic;
        }}

        table {{
            width: 100%;
            border-collapse: collapse;
            margin: 2rem 0;
            font-size: 0.9rem;
        }}

        th {{
            background: var(--primary-light);
            color: var(--primary);
            text-align: left;
            padding: 1rem;
            font-weight: 600;
            border-bottom: 2px solid var(--border);
        }}

        td {{
            padding: 1rem;
            border-bottom: 1px solid var(--border);
        }}

        tr:last-child td {{
            border-bottom: none;
        }}

        blockquote {{
            border-left: 4px solid var(--primary);
            margin: 2rem 0;
            padding: 1rem 2rem;
            background: var(--primary-light);
            border-radius: 0 0.5rem 0.5rem 0;
            color: #334155;
            font-style: italic;
        }}

        code {{
            background: #f1f5f9;
            padding: 0.2rem 0.4rem;
            border-radius: 0.25rem;
            font-size: 0.9em;
            color: #e11d48;
        }}

        pre code {{
            display: block;
            padding: 1.5rem;
            overflow-x: auto;
            color: #f8fafc;
            background: #1e293b;
            border-radius: 0.75rem;
        }}

        hr {{
            border: 0;
            height: 1px;
            background: linear-gradient(to right, transparent, var(--border), transparent);
            margin: 4rem 0;
        }}

        .page-break-marker {{
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 3rem 0;
            color: var(--text-muted);
            font-size: 0.7rem;
            text-transform: uppercase;
            letter-spacing: 0.2em;
        }}

        .page-break-marker::before, .page-break-marker::after {{
            content: "";
            flex: 1;
            height: 1px;
            background: var(--border);
            margin: 0 1.5rem;
        }}

        footer {{
            margin-top: 4rem;
            text-align: center;
            color: var(--text-muted);
            font-size: 0.875rem;
        }}

        @media print {{
            body {{ background: white; padding: 0; }}
            .document-container {{ box-shadow: none; border: none; padding: 0; }}
            .extracted-image-wrapper {{ margin: 2rem 0; }}
        }}

        @media (max-width: 640px) {{
            body {{ padding: 1rem; }}
            .document-container {{ padding: 1.5rem; }}
            .extracted-image-wrapper {{ margin: 1.5rem -1rem; }}
            h1.doc-title {{ font-size: 1.75rem; }}
        }}
    </style>
</head>
<body>
    <div class="document-wrapper">
        <header>
            <div class="badge">AI OCR Conversion</div>
            <h1 class="doc-title">{title}</h1>
            <div class="meta-info">Converted with Semantic Canvas AI</div>
        </header>

        <div class="document-container">
            {body_html}
        </div>

        <footer>
            <p>&copy; {time.strftime('%Y')} &bull; Semantic Canvas Document Intelligence</p>
        </footer>
    </div>
</body>
</html>"""

ocr_service = OCRService()
