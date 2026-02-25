from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, ListFlowable, ListItem, Table, TableStyle
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.lib.pagesizes import A4
import os
import re

class PDFGenerator:
    """A utility class to convert Markdown-formatted text into a PDF document."""

    def __init__(self):
        self.width, self.height = A4
        self.styles = getSampleStyleSheet()
        self.story = []
        self._setup_custom_styles()

    def _setup_custom_styles(self):
        """Define custom paragraph styles for Markdown elements."""
        # Title
        if 'MarkdownTitle' not in self.styles:
            self.styles.add(ParagraphStyle(
                name='MarkdownTitle',
                parent=self.styles['Heading1'],
                fontSize=24,
                spaceAfter=20,
                textColor=colors.HexColor("#2c3e50"),
                alignment=1 # Center
            ))
        
        # Heading 1
        if 'MarkdownHeading1' not in self.styles:
            self.styles.add(ParagraphStyle(
                name='MarkdownHeading1',
                parent=self.styles['Heading1'],
                fontSize=18,
                spaceAfter=12,
                textColor=colors.HexColor("#2c3e50")
            ))
        
        # Heading 2
        if 'MarkdownHeading2' not in self.styles:
            self.styles.add(ParagraphStyle(
                name='MarkdownHeading2',
                parent=self.styles['Heading2'],
                fontSize=16,
                spaceBefore=12,
                spaceAfter=10,
                textColor=colors.HexColor("#34495e")
            ))
        
        # Heading 3
        if 'MarkdownHeading3' not in self.styles:
            self.styles.add(ParagraphStyle(
                name='MarkdownHeading3',
                parent=self.styles['Heading3'],
                fontSize=14,
                spaceBefore=10,
                spaceAfter=8,
                textColor=colors.HexColor("#7f8c8d")
            ))
        
        # Code Block
        if 'MarkdownCode' not in self.styles:
            self.styles.add(ParagraphStyle(
                name='MarkdownCode',
                parent=self.styles['Code'],
                fontSize=10,
                leading=12,
                backColor=colors.HexColor("#f4f6f7"),
                textColor=colors.HexColor("#2c3e50"),
                borderPadding=5,
                spaceAfter=10,
                fontName='Courier'
            ))

    def _normalize_unicode(self, text: str) -> str:
        """Normalize Unicode characters to ASCII equivalents to prevent squares in PDF."""
        if not isinstance(text, str): return text
        
        # Mapping of problematic Unicode characters to safe ASCII/Standard-14 equivalents
        unicode_map = {
            '\u00a0': ' ',     # Non-breaking space
            '\u00ad': '',      # Soft hyphen (remove to join words, or replace with - if at end? empty is safer mid-word)
            '\u2010': '-',     # Hyphen
            '\u2011': '-',     # Non-breaking hyphen
            '\u2012': '-',     # Figure dash
            '\u2013': '-',     # En dash
            '\u2014': '-',     # Em dash
            '\u2015': '-',     # Horizontal bar
            '\u2018': "'",     # Left single quotation mark
            '\u2019': "'",     # Right single quotation mark
            '\u201a': "'",     # Single low-9 quotation mark
            '\u201b': "'",     # Single high-reversed-9 quotation mark
            '\u201c': '"',     # Left double quotation mark
            '\u201d': '"',     # Right double quotation mark
            '\u201e': '"',     # Double low-9 quotation mark
            '\u201f': '"',     # Double high-reversed-9 quotation mark
            '\u2026': '...',   # Horizontal ellipsis
            '\u2022': '*',     # Bullet
            '\u202f': ' ',     # Narrow no-break space
            '\u200b': '',      # Zero width space
        }
        
        for char, replacement in unicode_map.items():
            text = text.replace(char, replacement)
            
        return text

    def _repair_encoding(self, text: str) -> str:
        """Repair common encoding artifacts and normalize Unicode."""
        if not isinstance(text, str): return text
        
        # 1. Fix double-encoded UTF-8 strings (e.g. from legacy DBs or mangled exports)
        try:
            # Only attempt if it looks like it might be mangled (contains typical patterns)
            if any(p in text for p in ['â€™', 'â€œ', 'â€', 'â€“']):
                text = text.encode('cp1252').decode('utf-8')
        except (UnicodeEncodeError, UnicodeDecodeError):
            pass
            
        # 2. Normalize specialized Unicode to safe ASCII
        text = self._normalize_unicode(text)
        
        return text

    def _format_inline_styles(self, text):
        """Convert markdown inline styles to ReportLab XML tags."""
        if not text: return ""
        # 1. Encoding & Unicode repair first
        text = self._repair_encoding(text)
        
        # 2. XML Escaping (ESSENTIAL for Paragraph)
        text = text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
        
        # 3. Bold
        text = re.sub(r'\*\*(.*?)\*\*', r'<b>\1</b>', text)
        # 4. Italic
        text = re.sub(r'\*(.*?)\*', r'<i>\1</i>', text)
        # 5. Monospace
        text = re.sub(r'`(.*?)`', r'<font face="Courier" size="9" backColor="#eeeeee">\1</font>', text)
        # 6. Links: [text](url) -> <a href="url" color="blue">text</a>
        text = re.sub(r'\[(.*?)\]\((.*?)\)', r'<a href="\2" color="blue"><u>\1</u></a>', text)
        return text

    def start_pdf(self, output_path):
        """Initialize the PDF document."""
        self.doc = SimpleDocTemplate(
            output_path,
            pagesize=A4,
            rightMargin=50,
            leftMargin=50,
            topMargin=50,
            bottomMargin=50
        )
        self.story = []

    def _add_table(self, table_data):
        """Add a formatted table to the story."""
        if not table_data: return
        
        # Format cell content
        formatted_data = []
        for row in table_data:
            formatted_row = [Paragraph(self._format_inline_styles(str(cell)), self.styles['Normal']) for cell in row]
            formatted_data.append(formatted_row)
            
        # Create Table
        # Try to calculate column widths or use percentage
        table = Table(formatted_data, hAlign='LEFT', repeatRows=1)
        table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor("#f2f4f4")),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.HexColor("#2c3e50")),
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
            ('BACKGROUND', (0, 1), (-1, -1), colors.white),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ]))
        self.story.append(table)
        self.story.append(Spacer(1, 12))

    def parse_markdown(self, text):
        """Improved Markdown parser that handles paragraphs, tables, and lists."""
        lines = text.split('\n')
        print(f"[PDFGenerator] Starting parse of {len(lines)} lines")
        
        i = 0
        while i < len(lines):
            line = lines[i]
            line_stripped = line.strip()
            
            # --- Skip Empty Lines ---
            if not line_stripped:
                i += 1
                continue
                
            # --- Code Blocks ---
            if line_stripped.startswith('```'):
                print(f"[PDFGenerator] Line {i}: Starting code block")
                code_buffer = []
                i += 1
                while i < len(lines) and not lines[i].strip().startswith('```'):
                    code_line = lines[i].replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
                    code_line = code_line.replace(" ", "&nbsp;")
                    code_buffer.append(code_line)
                    i += 1
                i += 1 # skip end ```
                self.story.append(Paragraph("<br/>".join(code_buffer), self.styles['MarkdownCode']))
                self.story.append(Spacer(1, 12))
                continue

            # --- Headers ---
            header_match = re.match(r'^(#{1,6})\s+(.*)', line_stripped)
            if header_match:
                print(f"[PDFGenerator] Line {i}: Found header level {len(header_match.group(1))}")
                level = min(len(header_match.group(1)), 3)
                content = header_match.group(2)
                style_name = f'MarkdownHeading{level}'
                self.story.append(Paragraph(self._format_inline_styles(content), self.styles[style_name]))
                self.story.append(Spacer(1, 12))
                i += 1
                continue

            # --- Lists (Unordered) ---
            if line_stripped.startswith(('- ', '* ', '+ ')):
                print(f"[PDFGenerator] Line {i}: Starting unordered list")
                items = []
                while i < len(lines) and lines[i].strip().startswith(('- ', '* ', '+ ')):
                    item_text = lines[i].strip()[2:]
                    items.append(ListItem(Paragraph(self._format_inline_styles(item_text), self.styles['Normal']), leftIndent=20))
                    i += 1
                self.story.append(ListFlowable(items, bulletType='bullet', start='circle', leftIndent=10))
                self.story.append(Spacer(1, 12))
                continue
                
            # --- Lists (Ordered) ---
            if re.match(r'^\d+\.\s+', line_stripped):
                print(f"[PDFGenerator] Line {i}: Starting ordered list")
                items = []
                while i < len(lines) and re.match(r'^\d+\.\s+', lines[i].strip()):
                    item_text = re.sub(r'^\d+\.\s+', '', lines[i].strip())
                    items.append(ListItem(Paragraph(self._format_inline_styles(item_text), self.styles['Normal']), leftIndent=20))
                    i += 1
                self.story.append(ListFlowable(items, bulletType='1', leftIndent=10))
                self.story.append(Spacer(1, 12))
                continue

            # --- Tables ---
            if line_stripped.startswith('|'):
                print(f"[PDFGenerator] Line {i}: Starting table")
                table_rows = []
                while i < len(lines) and lines[i].strip().startswith('|'):
                    row_stripped = lines[i].strip()
                    if re.match(r'^\|[\s\-\|]*\|$', row_stripped):
                        i += 1
                        continue
                    cells = [c.strip() for c in row_stripped.split('|') if c.strip() or row_stripped.count('|') > 2]
                    if row_stripped.startswith('|') and len(cells) > 0 and not cells[0]: cells = cells[1:]
                    if row_stripped.endswith('|') and len(cells) > 0 and not cells[-1]: cells = cells[:-1]
                    if cells: table_rows.append(cells)
                    i += 1
                self._add_table(table_rows)
                continue

            # --- Paragraphs (Group multiple lines with a safety limit to avoid truncation) ---
            paragraph_lines = []
            start_i = i
            # Limit number of lines per Paragraph object for better page breaking
            MAX_LINES_PER_PARA = 30 
            
            while i < len(lines) and lines[i].strip() and len(paragraph_lines) < MAX_LINES_PER_PARA:
                l_s = lines[i].strip()
                # Stop if next line looks like a different block type
                if any(l_s.startswith(p) for p in ['#', '```', '-', '*', '+', '|']): break
                if re.match(r'^\d+\.\s+', l_s): break
                paragraph_lines.append(l_s)
                i += 1
            
            if paragraph_lines:
                print(f"[PDFGenerator] Line {start_i}: Added paragraph with {len(paragraph_lines)} lines")
                combined_text = " ".join(paragraph_lines)
                combined_text = self._repair_encoding(combined_text)
                self.story.append(Paragraph(self._format_inline_styles(combined_text), self.styles['Normal']))
                self.story.append(Spacer(1, 12))
            else:
                # If we get here but line_stripped was truthy, it means it's a line with a prefix 
                # that wasn't handled by the specific block handlers above. 
                # We log it and skip to avoid infinite loop.
                # (Note: i already pointed to lines[start_i] which is line_stripped)
                if i == start_i:
                    print(f"[PDFGenerator] WARNING: Skipping unexpected line {i}: '{lines[i][:20]}...'")
                    i += 1

        print(f"[PDFGenerator] Parse complete. Added {len(self.story)} flowables.")

    def build(self):
        """Generate the PDF file."""
        self.doc.build(self.story)

def convert_markdown_to_pdf(content, output_path):
    """Static wrapper for easy usage."""
    generator = PDFGenerator()
    generator.start_pdf(output_path)
    generator.parse_markdown(content)
    generator.build()
    return output_path
