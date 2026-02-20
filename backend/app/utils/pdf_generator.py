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

    def _repair_encoding(self, text: str) -> str:
        """Repair common encoding artifacts like â€™ -> ’."""
        if not isinstance(text, str): return text
        try:
            # Fix double-encoded UTF-8
            return text.encode('cp1252').decode('utf-8')
        except (UnicodeEncodeError, UnicodeDecodeError):
            replacements = {
                'â€™': "’", 'â€œ': "“", 'â€?': "”",
                'â€”': "—", 'â€“': "–", 'â€¯': " ", 'â€\x8b': "",
            }
            for old, new in replacements.items():
                text = text.replace(old, new)
            return text

    def _format_inline_styles(self, text):
        """Convert markdown inline styles to ReportLab XML tags."""
        if not text: return ""
        # XML Escaping
        text = text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
        # Bold
        text = re.sub(r'\*\*(.*?)\*\*', r'<b>\1</b>', text)
        # Italic
        text = re.sub(r'\*(.*?)\*', r'<i>\1</i>', text)
        # Monospace
        text = re.sub(r'`(.*?)`', r'<font face="Courier" size="9" backColor="#eeeeee">\1</font>', text)
        # Links: [text](url) -> <a href="url" color="blue">text</a>
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
            # Use regex to handle leading spaces and level
            header_match = re.match(r'^(#{1,6})\s+(.*)', line_stripped)
            if header_match:
                level = min(len(header_match.group(1)), 3) # capped at 3 styles
                content = header_match.group(2)
                style_name = f'MarkdownHeading{level}'
                self.story.append(Paragraph(self._format_inline_styles(content), self.styles[style_name]))
                self.story.append(Spacer(1, 12))
                i += 1
                continue

            # --- Lists (Unordered) ---
            if line_stripped.startswith(('- ', '* ', '+ ')):
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
                table_rows = []
                while i < len(lines) and lines[i].strip().startswith('|'):
                    row_stripped = lines[i].strip()
                    # Skip separator line |---|---|
                    if re.match(r'^\|[\s\-\|]*\|$', row_stripped):
                        i += 1
                        continue
                    # Parse row
                    cells = [c.strip() for c in row_stripped.split('|') if c.strip() or row_stripped.count('|') > 2]
                    # Filter out empty cells at start/end if they are artifacts of split
                    if row_stripped.startswith('|') and len(cells) > 0 and not cells[0]: cells = cells[1:]
                    if row_stripped.endswith('|') and len(cells) > 0 and not cells[-1]: cells = cells[:-1]
                    
                    if cells:
                        table_rows.append(cells)
                    i += 1
                self._add_table(table_rows)
                continue

            # --- Paragraphs (Group multiple lines) ---
            paragraph_lines = []
            while i < len(lines) and lines[i].strip():
                l_s = lines[i].strip()
                # If next line looks like a different block, stop
                if any(l_s.startswith(p) for p in ['#', '```', '-', '*', '+', '|']): break
                if re.match(r'^\d+\.\s+', l_s): break
                
                paragraph_lines.append(l_s)
                i += 1
            
            if paragraph_lines:
                combined_text = " ".join(paragraph_lines)
                # Repair encoding before final render
                combined_text = self._repair_encoding(combined_text)
                self.story.append(Paragraph(self._format_inline_styles(combined_text), self.styles['Normal']))
                self.story.append(Spacer(1, 12))
            else:
                i += 1

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
