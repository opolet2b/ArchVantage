"""
Document Converter Primitive

Converts documents between formats: HTML, Markdown, PDF, RTF, TXT.
Uses pure Python libraries with intelligent input/format detection.

Supports:
- Direct text content OR file path input (auto-detected)
- Auto-format detection from extension and content analysis
- Conversion options (CSS, page size, margins)
- Seamless JSON Mapping integration
"""
from typing import Any, Dict, Tuple, Optional
import os
import re
import tempfile
from pathlib import Path
from datetime import datetime
from app.services.agent_primitives.base import BasePrimitive, PrimitiveResult


class DocumentConverterPrimitive(BasePrimitive):
    """
    Document format conversion primitive.
    
    Converts between HTML, Markdown, PDF, RTF, TXT formats using
    pure Python libraries (no Pandoc or LibreOffice required).
    """
    
    @property
    def name(self) -> str:
        """Return the primitive type name."""
        return "DOCUMENT_CONVERTER"
    
    @property
    def description(self) -> str:
        """Return a description of what this primitive does."""
        return (
            "Convert documents between formats (HTML, Markdown, PDF, RTF, TXT) "
            "with intelligent input and format detection."
        )
    
    @property
    def param_schema(self) -> Dict[str, Any]:
        """Return JSON Schema for the primitive's parameters."""
        return {
            "type": "object",
            "properties": {
                "input_file_path": {
                    "type": "string",
                    "description": "Path to a document file on the file system. Mutually exclusive with input_content."
                },
                "input_content": {
                    "type": "string",
                    "description": "Direct document content (text). Mutually exclusive with input_file_path."
                },
                "input_format": {
                    "type": "string",
                    "enum": ["pdf", "html", "markdown", "md", "rtf", "txt", "auto"],
                    "default": "auto",
                    "description": "Source format. Use 'auto' to detect from file extension or content."
                },
                "output_format": {
                    "type": "string",
                    "enum": ["pdf", "html", "markdown", "md", "rtf", "txt", "csv"],
                    "description": "Target format (REQUIRED)"
                },
                "output_path": {
                    "type": "string",
                    "description": "Optional: Specific output file path. If not set, auto-generates for binary formats."
                },
                "conversion_options": {
                    "type": "object",
                    "properties": {
                        "css": {
                            "type": "string",
                            "description": "Custom CSS for HTML→PDF conversion"
                        },
                        "page_size": {
                            "type": "string",
                            "enum": ["A4", "Letter", "Legal"],
                            "default": "A4"
                        },
                        "margins": {
                            "type": "object",
                            "properties": {
                                "top": {"type": "string", "default": "2cm"},
                                "bottom": {"type": "string", "default": "2cm"},
                                "left": {"type": "string", "default": "2cm"},
                                "right": {"type": "string", "default": "2cm"}
                            }
                        }
                    }
                },
                "output_variable": {
                    "type": "string",
                    "default": "converted_document",
                    "description": "Variable name to store result"
                }
            },
            "required": ["output_format"]
        }
    
    async def execute(
        self, 
        params: Dict[str, Any], 
        state: Dict[str, Any]
    ) -> PrimitiveResult:
        """
        Execute document conversion.
        
        Flow:
        1. Detect if input is file path or content
        2. Determine input format (from param, extension, or content)
        3. Execute conversion
        4. Return result (text or file path)
        """
        try:
            # Get parameters from node config
            input_file_path_param = params.get("input_file_path", "")
            input_content_param = params.get("input_content", "")
            
            # Auto-merge from state.variables (like CALL_TOOL does)
            variables = state.get("variables", {})
            
            # Priority: params first, then state.variables
            input_file_path = input_file_path_param
            input_content = input_content_param
            
            # If not provided in params, check state.variables
            if not input_file_path and "input_file_path" in variables:
                input_file_path = variables["input_file_path"]
            
            if not input_content and "input_content" in variables:
                input_content = variables["input_content"]
            
            # Also check nested in common output wrappers (result, mapped_data)
            if not input_file_path and not input_content:
                for wrapper in ["result", "mapped_data"]:
                    if wrapper in variables and isinstance(variables[wrapper], dict):
                        if "input_file_path" in variables[wrapper]:
                            input_file_path = variables[wrapper]["input_file_path"]
                        if "input_content" in variables[wrapper]:
                            input_content = variables[wrapper]["input_content"]
                        if input_file_path or input_content:
                            break

            # ROBUSTNESS FIX: If input_content is a dict/list (or string of one), extract the actual text content.
            # This prevents converting the raw state JSON into a PDF.
            if input_content:
                import json
                import ast
                extracted_content = None
                
                # Check if it's already a dict object
                if isinstance(input_content, (dict, list)):
                    obj = input_content
                # Check if it's a string that looks like JSON or Python Dict
                elif isinstance(input_content, str) and input_content.strip().startswith(("{", "[")):
                    try:
                         # Try JSON first
                         obj = json.loads(input_content)
                    except:
                         # Try Python literal eval (for single quoted strings)
                         try:
                             obj = ast.literal_eval(input_content)
                         except:
                             obj = None
                else:
                    obj = None
                
                if isinstance(obj, dict):
                    # Try common content keys in priority order
                    extracted_content = (
                        obj.get("formatted_output") or 
                        obj.get("generated_markdown") or 
                        obj.get("text") or 
                        obj.get("content") or 
                        obj.get("markdown") or
                        obj.get("result")
                    )
                    # If we found content inside, update input_content
                    if extracted_content and isinstance(extracted_content, str):
                        print(f"[DocumentConverter] Extracted content from input dict (Keys: {list(obj.keys())})")
                        input_content = extracted_content
            
            # Resolve {{variable}} syntax if present (advanced usage)
            if input_file_path and "{{" in str(input_file_path):
                input_file_path = self.resolve_variables(str(input_file_path), state)
            
            if input_content and "{{" in str(input_content):
                input_content = self.resolve_variables(str(input_content), state)
            
            # Get other parameters
            input_format_param = params.get("input_format", "auto")
            output_format = params.get("output_format", "").lower()
            output_path_param = params.get("output_path")
            conversion_options = params.get("conversion_options", {})
            output_var = params.get("output_variable", "converted_document")
            
            # Validate: need either file path or content
            if not input_file_path and not input_content:
                return PrimitiveResult(
                    success=False,
                    error="InputRequired: Either input_file_path or input_content must be provided"
                )
            
            if not output_format:
                return PrimitiveResult(
                    success=False,
                    error="OutputFormatRequired: output_format parameter is required"
                )
            
            # Normalize format names
            if output_format == "md":
                output_format = "markdown"
            
            # Determine which input to use (prioritize content over file path)
            if input_content:
                mode = "text"
                content = input_content
                detected_format = self._detect_format_from_content(content)
                print(f"[DEBUG] Using input_content, detected format: {detected_format}")
            else:
                # File path mode
                if os.path.exists(input_file_path):
                    mode = "file"
                    content = self._read_file(input_file_path)
                    detected_format = self._detect_format_from_extension(input_file_path)
                    print(f"[DEBUG] Using input_file_path, detected format: {detected_format}")
                else:
                    return PrimitiveResult(
                        success=False,
                        error=f"FileNotFound: File path '{input_file_path}' does not exist"
                    )
            
            # Use detected format if auto
            print(f"[DEBUG] input_format_param: '{input_format_param}'")
            print(f"[DEBUG] detected_format: '{detected_format}'")
            
            if input_format_param == "auto":
                input_format = detected_format
                print(f"[DEBUG] Using auto-detected format: {input_format}")
            else:
                input_format = input_format_param.lower()
                print(f"[DEBUG] Using user-specified format: {input_format}")
                if input_format == "md":
                    input_format = "markdown"
            
            # Step 3: Validate conversion path
            if not self._is_conversion_supported(input_format, output_format):
                return PrimitiveResult(
                    success=False,
                    error=f"UnsupportedConversion: {input_format} → {output_format} is not supported"
                )
            
            # Step 4: Execute conversion
            converted_content = self._convert(
                content, 
                input_format, 
                output_format,
                conversion_options
            )
            
            # Step 5: Format output
            output_data = self._format_output(
                converted_content,
                output_format,
                output_path_param
            )
            
            # Return result
            return PrimitiveResult(
                success=True,
                output={
                    output_var: output_data.get("content"),
                    "output_path": output_data.get("path"),
                    "detected_input_format": detected_format,
                    "input_format_used": input_format,
                    "output_format": output_format,
                    "mode": mode
                }
            )
            
        except Exception as e:
            return PrimitiveResult(
                success=False,
                error=f"ConversionError: {str(e)}"
            )
    
    # ==================== Input Detection ====================
    
    def _is_file_path(self, text: str) -> bool:
        """
        Determine if input looks like a file path.
        
        Checks for:
        - Path separators (/ or \\)
        - File extensions
        - Known directory prefixes
        - Length (paths are usually < 500 chars)
        """
        # Too long to be a path
        if len(text) > 500:
            return False
        
        # Check for path indicators
        has_path_sep = '/' in text or '\\\\' in text
        has_extension = text.endswith(('.pdf', '.html', '.htm', '.md', '.markdown', '.rtf', '.txt'))
        starts_with_known_dir = text.startswith(('C:', '/tmp', '/var', '/uploads', '\\\\'))
        
        return has_path_sep or has_extension or starts_with_known_dir
    
    def _detect_input_and_format(
        self, 
        input_file: str, 
        format_param: str
    ) -> Tuple[str, str, str]:
        """
        Detect input mode and format.
        
        Returns:
            (mode, content, detected_format)
            - mode: 'file' or 'text'
            - content: file content or original text
            - detected_format: detected format string
        """
        # Check if it looks like a file path
        if self._is_file_path(input_file):
            if os.path.exists(input_file):
                # It's a valid file path
                content = self._read_file(input_file)
                detected_format = self._detect_format_from_extension(input_file)
                return ('file', content, detected_format)
            else:
                # Looks like path but doesn't exist - treat as text content
                detected_format = self._detect_format_from_content(input_file)
                return ('text', input_file, detected_format)
        else:
            # Direct text content
            detected_format = self._detect_format_from_content(input_file)
            return ('text', input_file, detected_format)
    
    def _read_file(self, file_path: str) -> str:
        """Read file content (binary or text)."""
        # Try binary first for PDFs
        ext = Path(file_path).suffix.lower()
        if ext == '.pdf':
            with open(file_path, 'rb') as f:
                return f.read()
        else:
            with open(file_path, 'r', encoding='utf-8') as f:
                return f.read()
    
    # ==================== Format Detection ====================
    
    EXTENSION_MAP = {
        '.pdf': 'pdf',
        '.html': 'html',
        '.htm': 'html',
        '.md': 'markdown',
        '.markdown': 'markdown',
        '.rtf': 'rtf',
        '.txt': 'txt',
        '.text': 'txt'
    }
    
    def _detect_format_from_extension(self, file_path: str) -> str:
        """Detect format from file extension."""
        ext = Path(file_path).suffix.lower()
        return self.EXTENSION_MAP.get(ext, 'txt')
    
    def _detect_format_from_content(self, content: str) -> str:
        """
        Analyze content to guess format.
        """
        # Handle binary content
        if isinstance(content, bytes):
            if content.startswith(b'%PDF'):
                return 'pdf'
            if content.startswith(b'{\\\\rtf'):
                return 'rtf'
            return 'txt'
        
        preview = content[:500].strip()
        preview_lower = preview.lower()
        
        # HTML: Check for tags
        if preview_lower.startswith('<!doctype html') or \
           preview_lower.startswith('<html') or \
           '<body' in preview_lower[:200]:
            return 'html'
        
        # Markdown: Check for headers/code blocks
        if content.startswith('#') or \
           '\\n# ' in content[:200] or \
           '```' in content[:200]:
            return 'markdown'
        
        # RTF: Check RTF header
        if content.startswith('{\\\\rtf'):
            return 'rtf'
        
        # Default to plain text
        return 'txt'
    
    # ==================== Conversion Logic ====================
    
    def _is_conversion_supported(self, from_fmt: str, to_fmt: str) -> bool:
        """Check if conversion path is supported."""
        # Same format - no conversion needed
        if from_fmt == to_fmt:
            return True
        
        # Supported conversion paths
        supported = {
            ('markdown', 'html'), ('markdown', 'pdf'), ('markdown', 'rtf'), ('markdown', 'txt'),
            ('html', 'pdf'), ('html', 'markdown'), ('html', 'rtf'), ('html', 'txt'),
            ('pdf', 'txt'), ('pdf', 'html'), ('pdf', 'markdown'),
            ('rtf', 'txt'), ('rtf', 'html'), ('rtf', 'markdown'), ('rtf', 'pdf'),
            ('txt', 'html'), ('txt', 'markdown'), ('txt', 'pdf'), ('txt', 'rtf'), ('txt', 'csv'),
            ('markdown', 'csv')
        }
        
        return (from_fmt, to_fmt) in supported
    
    def _convert(
        self, 
        content: str, 
        from_fmt: str, 
        to_fmt: str,
        options: Dict[str, Any]
    ) -> Any:
        """
        Execute the actual conversion.
        
        Returns converted content (str for text formats, bytes for binary).
        """
        def repair_encoding(text: str) -> str:
            """Repair common encoding artifacts like â€™ -> ’."""
            if not isinstance(text, str): return text
            try:
                # Fix double-encoded UTF-8
                return text.encode('cp1252').decode('utf-8')
            except (UnicodeEncodeError, UnicodeDecodeError):
                # Common manual replacements for known artifacts
                replacements = {
                    'â€™': "’",
                    'â€œ': "“",
                    'â€?': "”",
                    'â€”': "—",
                    'â€“': "–",
                    'â€¯': " ", # Narrow no-break space
                    'â€\x8b': "", # Zero width space
                    '\â€\xaf': " ",
                }
                for old, new in replacements.items():
                    text = text.replace(old, new)
                return text

        # No conversion needed
        if from_fmt == to_fmt:
            return repair_encoding(content) if isinstance(content, str) else content

        # Import libraries here to avoid loading if not needed
        import markdown2
        import html2text
        from xhtml2pdf import pisa  # Pure Python PDF library
        from app.utils.pdf_generator import convert_markdown_to_pdf # Use unified generator
        import pdfplumber
        from striprtf.striprtf import rtf_to_text
        from io import BytesIO
        from bs4 import BeautifulSoup
        
        # Define conversion functions
        def md_to_html(md: str) -> str:
            # Unescape literal \n to actual newlines
            md = md.replace('\\n', '\n')
            
            # Strip YAML frontmatter if present
            if md.strip().startswith('---'):
                parts = md.split('---', 2)
                if len(parts) >= 3:
                    md = parts[2].strip()  # Content after second ---
            
            print("\n" + "="*80)
            print("[MARKDOWN CONVERSION DEBUG]")
            print("="*80)
            print(f"INPUT to markdown converter (after unescaping):")
            print(f"  Length: {len(md)} chars")
            print(f"  First 1000 chars:\n{md[:1000]}")
            print("="*80)
            
            html = markdown2.markdown(md, extras=['tables', 'fenced-code-blocks', 'header-ids', 'break-on-newline'])
            
            print(f"OUTPUT from markdown converter:")
            print(f"  Length: {len(html)} chars")
            print(f"  First 1000 chars:\n{html[:1000]}")
            print("="*80 + "\n")
            return html
        
        def html_to_md(html: str) -> str:
            h = html2text.HTML2Text()
            h.body_width = 0  # Don't wrap lines
            return h.handle(html)
        
        def html_to_pdf(html: str) -> bytes:
            """Convert HTML to PDF using xhtml2pdf."""
            result = BytesIO()
            pdf = pisa.pisaDocument(BytesIO(html.encode('utf-8')), result)
            if pdf.err:
                raise Exception(f"PDF generation error: {pdf.err}")
            return result.getvalue()
        
        def pdf_to_text(pdf_content: bytes) -> str:
            with pdfplumber.open(BytesIO(pdf_content)) as pdf:
                return '\\n\\n'.join(page.extract_text() or '' for page in pdf.pages)
        
        def rtf_to_text_conv(rtf: str) -> str:
            return rtf_to_text(rtf)
        
        def text_to_html(txt: str) -> str:
            # Simple text to HTML conversion
            paragraphs = txt.split('\\n\\n')
            html_parts = ['<html><body>']
            for para in paragraphs:
                html_parts.append(f'<p>{para.replace(chr(10), "<br>")}</p>')
            html_parts.append('</body></html>')
            return '\\n'.join(html_parts)
        
        import csv
        from io import StringIO
        import re

        def md_to_csv(md: str) -> str:
            """
            Convert Markdown content to CSV.
            Smart Logic:
            1. Table Detection:
               - If simple data table -> Standard CSV.
               - If 'Layout Table' (cells with bullets/newlines) -> Flatten to 'Category, Content'.
            2. List Detection: Flatten to 'Section, Content'.
            3. Fallback: Text.
            """
            # 1. Table Detection & Parsing
            table_rows = []
            lines = md.split('\n')
            in_table = False
            
            for line in lines:
                if line.strip().startswith('|'):
                    if re.match(r'\|\s*:?-+:?\s*\|', line):
                        continue
                    cells = [c.strip() for c in line.strip().split('|')]
                    if line.strip().startswith('|') and line.strip().endswith('|'):
                        cells = cells[1:-1]
                    table_rows.append(cells)
                    in_table = True
                elif in_table:
                    break
            
            if len(table_rows) > 1:
                # Check for "Rich Content" (Lists/Newlines) to decide strategy
                has_rich_content = any(
                    ('<br>' in cell or '- ' in cell or len(cell) > 100) 
                    for row in table_rows for cell in row
                )
                
                if not has_rich_content:
                    # Simple Data Table -> Return as-is
                    output = StringIO()
                    writer = csv.writer(output)
                    writer.writerows(table_rows)
                    return output.getvalue()
                
                # Complex Layout Table -> Flatten to "Category, Item"
                # Heuristic: Short rows are Headers, Long rows are Content
                flat_rows = [["Category", "Content"]]
                current_headers = ["Column " + str(i+1) for i in range(len(table_rows[0]))]
                
                for row in table_rows:
                    # Is this a Header Row? (All cells short, no bullets)
                    is_header_row = all(len(cell) < 50 and not '<br>' in cell and not '- ' in cell for cell in row)
                    
                    if is_header_row:
                        current_headers = row
                        # Normalize headers to match column count
                        if len(current_headers) < len(row):
                             current_headers.extend(["Col"] * (len(row) - len(current_headers)))
                        continue
                        
                    # Process Content Row
                    for i, cell in enumerate(row):
                        if i >= len(current_headers): break
                        category = current_headers[i]
                        
                        # Clean and Split content
                        # Replace <br> with newlines, then split by newline
                        clean_cell = cell.replace('<br>', '\n').replace('<br/>', '\n')
                        items = clean_cell.split('\n')
                        
                        for item in items:
                            item = item.strip()
                            # Remove bullet points
                            if item.startswith('- ') or item.startswith('* '):
                                item = item[2:].strip()
                            elif re.match(r'^\d+\.', item):
                                item = re.sub(r'^\d+\.\s*', '', item)
                            
                            if item:
                                flat_rows.append([category, item])
                                
                output = StringIO()
                writer = csv.writer(output)
                writer.writerows(flat_rows)
                return output.getvalue()
            
            # 2. Section + List Detection (SAME AS BEFORE)
            csv_rows = [["Section", "Content"]]
            current_section = "General"
            has_structured_data = False
            
            for line in lines:
                line = line.strip()
                if not line: continue
                if line.startswith('#'):
                    current_section = line.lstrip('#').strip()
                elif line.startswith('**') and line.endswith('**'):
                    current_section = line[2:-2].strip()
                elif line.startswith('- ') or line.startswith('* '):
                    content = line[2:].strip()
                    csv_rows.append([current_section, content])
                    has_structured_data = True
                elif re.match(r'\d+\.', line):
                    parts = line.split('.', 1)
                    if len(parts) > 1:
                        content = parts[1].strip()
                        csv_rows.append([current_section, content])
                        has_structured_data = True
            
            if has_structured_data:
                output = StringIO()
                writer = csv.writer(output)
                writer.writerows(csv_rows)
                return output.getvalue()

            # 3. Fallback
            return f'"Content"\n"{md.replace(chr(34), "")}"'

        # Conversion matrix using multi-step paths
        # Direct conversions
        if (from_fmt, to_fmt) == ('markdown', 'html'):
            return md_to_html(content)
        elif (from_fmt, to_fmt) == ('html', 'markdown'):
            return html_to_md(content)
        elif (from_fmt, to_fmt) == ('html', 'pdf'):
            return html_to_pdf(content)
        elif (from_fmt, to_fmt) == ('pdf', 'txt'):
            return pdf_to_text(content)
        elif (from_fmt, to_fmt) == ('rtf', 'txt'):
            return rtf_to_text_conv(content)
        elif (from_fmt, to_fmt) == ('txt', 'html'):
            return text_to_html(content)
        
        # Multi-step conversions
            # MD → HTML → target
            # ROBUST FIX: Use ReportLab-based PDFGenerator directly for Markdown if targeting PDF
            if to_fmt == 'pdf':
                # Create a temp file for ReportLab to work with
                temp_pdf = self._generate_temp_path('pdf')
                # Repair encoding before conversion
                safe_content = repair_encoding(content)
                convert_markdown_to_pdf(safe_content, str(temp_pdf))
                with open(temp_pdf, 'rb') as f:
                    return f.read()
            
            html = md_to_html(content)
            if to_fmt == 'pdf':
                return html_to_pdf(html)
            elif to_fmt == 'txt':
                return html_to_md(html)  # MD → HTML → MD strips formatting
            elif to_fmt == 'csv':
                return md_to_csv(content)
            else:  # rtf
                return html  # Return HTML (RTF generation complex, return HTML as fallback)
        
        elif from_fmt == 'pdf':
            # PDF → Text → target
            text = pdf_to_text(content)
            if to_fmt == 'html':
                return text_to_html(text)
            elif to_fmt == 'markdown':
                return text  # Plain text works as markdown
        
        elif from_fmt == 'rtf':
            # RTF → Text → target
            text = rtf_to_text_conv(content)
            if to_fmt == 'html':
                return text_to_html(text)
            elif to_fmt == 'markdown':
                return text
            elif to_fmt == 'pdf':
                html = text_to_html(text)
                return html_to_pdf(html)
        
        elif from_fmt == 'txt':
            html = text_to_html(content)
            if to_fmt == 'pdf':
                return html_to_pdf(html)
            elif to_fmt == 'markdown':
                return content  # Plain text is valid markdown
            elif to_fmt == 'csv':
                return md_to_csv(content)
            elif to_fmt == 'rtf':
                return html  # Return HTML as fallback
        
        elif from_fmt == 'html':
            if to_fmt == 'txt':
                return html_to_md(content)  # MD converter produces clean text
            elif to_fmt == 'rtf':
                return content  # Return HTML as fallback
            elif to_fmt == 'csv':
                # Convert HTML to MD first, then to CSV
                return md_to_csv(html_to_md(content))

        
        # Final Fallback
        if to_fmt == 'pdf' and isinstance(content, str):
             # Final effort: use unified PDF generator
             temp_pdf = self._generate_temp_path('pdf')
             safe_content = repair_encoding(content)
             print(f"[DocumentConverter] Final fallback conversion to PDF for content len={len(safe_content)}")
             convert_markdown_to_pdf(safe_content, str(temp_pdf))
             with open(temp_pdf, 'rb') as f:
                 return f.read()

        # Fallback
        return content
    
    def _get_default_pdf_css(self) -> str:
        """Return default CSS for PDF generation."""
        return """
        body {
            font-family: Arial, sans-serif;
            font-size: 12pt;
            line-height: 1.6;
            margin: 2cm;
            color: #333;
        }
        h1 { font-size: 24pt; margin-top: 1cm; }
        h2 { font-size: 20pt; margin-top: 0.8cm; }
        h3 { font-size: 16pt; margin-top: 0.6cm; }
        code {
            background-color: #f4f4f4;
            padding: 2px 4px;
            border-radius: 3px;
            font-family: 'Courier New', monospace;
        }
        pre {
            background-color: #f4f4f4;
            padding: 10px;
            border-radius: 5px;
            overflow-x: auto;
        }
        table {
            border-collapse: collapse;
            width: 100%;
        }
        th, td {
            border: 1px solid #ddd;
            padding: 8px;
            text-align: left;
        }
        th {
            background-color: #f2f2f2;
        }
        """
    
    # ==================== Output Formatting ====================
    
    def _format_output(
        self,
        converted_content: Any,
        output_format: str,
        output_path_param: Optional[str]
    ) -> Dict[str, Any]:
        """
        Format output based on format type.
        
        Binary formats (PDF, RTF): Save to file, return path
        Text formats (HTML, MD, TXT): Return content directly
        """
        # Binary formats - save to file
        if output_format in ['pdf', 'rtf']:
            output_path = output_path_param or self._generate_temp_path(output_format)
            
            # Write to file
            mode = 'wb' if isinstance(converted_content, bytes) else 'w'
            encoding = None if isinstance(converted_content, bytes) else 'utf-8'
            
            with open(output_path, mode, encoding=encoding) as f:
                f.write(converted_content)
            
            return {
                "content": None,
                "path": str(output_path)
            }
        
        # Text formats - return content directly
        else:
            # If user specified output path, save anyway
            if output_path_param:
                with open(output_path_param, 'w', encoding='utf-8') as f:
                    f.write(converted_content)
                
                return {
                    "content": converted_content,
                    "path": str(output_path_param)
                }
            else:
                return {
                    "content": converted_content,
                    "path": None
                }
    
    def _generate_temp_path(self, output_format: str) -> Path:
        """Generate temporary file path for output."""
        temp_dir = Path(tempfile.gettempdir()) / "agent_conversions"
        temp_dir.mkdir(exist_ok=True)
        
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"converted_{timestamp}.{output_format}"
        
        return temp_dir / filename
