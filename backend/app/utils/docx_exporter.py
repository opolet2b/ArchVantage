import os
import zipfile
import shutil
import tempfile
import uuid
import re
from docx import Document
from docx.shared import Inches

def add_markdown_text(doc, text):
    """Parses basic markdown (**, *, \n) and appends to the docx Document natively."""
    if not text:
        return
    paragraphs = text.split('\n')
    for line in paragraphs:
        line = line.strip()
        if not line:
            continue
        p = doc.add_paragraph()
        bold_parts = re.split(r'(\*\*.*?\*\*)', line)
        for b_part in bold_parts:
            if b_part.startswith('**') and b_part.endswith('**'):
                p.add_run(b_part[2:-2]).bold = True
            else:
                italic_parts = re.split(r'(\*.*?\*)', b_part)
                for i_part in italic_parts:
                    if i_part.startswith('*') and i_part.endswith('*'):
                        p.add_run(i_part[1:-1]).italic = True
                    else:
                        p.add_run(i_part)

def generate_scenario_docx(payload: dict) -> str:
    temp_dir = tempfile.mkdtemp()
    
    dummy_png_path = os.path.join(temp_dir, "dummy.png")
    with open(dummy_png_path, "wb") as f:
        f.write(b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\nIDATx\x9cc\x00\x01\x00\x00\x05\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82')

    doc = Document()
    doc.add_heading("Architectural Scenario Impact Analysis", 0)

    doc.add_heading("1. Scenario Configuration", level=1)
    doc.add_paragraph(f"Action: {payload.get('action', 'none')}", style='List Bullet')
    doc.add_paragraph(f"Target Technology: {payload.get('targetTech', 'N/A')}", style='List Bullet')
    doc.add_paragraph(f"Custom Prompt: {payload.get('customPrompt', 'N/A')}", style='List Bullet')

    doc.add_heading("2. Structural Risk Assessment", level=1)
    doc.add_paragraph(f"Risk Score: {payload.get('risk_score', 0)} / 100")
    doc.add_paragraph("Rationale:")
    add_markdown_text(doc, payload.get('risk_rationale', ''))

    doc.add_heading("3. Architectural Diagrams", level=1)

    images_to_replace = []
    
    if payload.get("baseline_svg"):
        doc.add_heading("Baseline (As-Is)", level=2)
        pic = doc.add_picture(dummy_png_path, width=Inches(6.0))
        images_to_replace.append(payload["baseline_svg"])

    if payload.get("tobe_svg"):
        doc.add_heading("To-Be (Simulation)", level=2)
        pic = doc.add_picture(dummy_png_path, width=Inches(6.0))
        images_to_replace.append(payload["tobe_svg"])

    doc.add_heading("4. TOGAF ADM Phase Impacts", level=1)
    phases = payload.get("phases", [])
    for p in phases:
        doc.add_heading(f"Phase {p['phase']}: {p['name']}", level=2)
        doc.add_paragraph(f"Risk Level: {p['impact']}")
        add_markdown_text(doc, p['desc'])

    temp_docx = os.path.join(temp_dir, "temp.docx")
    doc.save(temp_docx)

    extract_dir = os.path.join(temp_dir, "extracted")
    os.makedirs(extract_dir, exist_ok=True)
    with zipfile.ZipFile(temp_docx, 'r') as zip_ref:
        zip_ref.extractall(extract_dir)

    media_dir = os.path.join(extract_dir, "word", "media")
    if os.path.exists(media_dir):
        image_files = sorted([f for f in os.listdir(media_dir) if f.endswith(".png")])
        for i, png_file in enumerate(image_files):
            if i < len(images_to_replace):
                svg_content = images_to_replace[i]
                base_name = os.path.splitext(png_file)[0]
                svg_file = base_name + ".svg"
                
                with open(os.path.join(media_dir, svg_file), "w", encoding="utf-8") as f:
                    f.write(svg_content)
                
                os.remove(os.path.join(media_dir, png_file))

                rels_file = os.path.join(extract_dir, "word", "_rels", "document.xml.rels")
                with open(rels_file, "r", encoding="utf-8") as f:
                    rels_content = f.read()
                rels_content = rels_content.replace(png_file, svg_file)
                with open(rels_file, "w", encoding="utf-8") as f:
                    f.write(rels_content)

    ct_file = os.path.join(extract_dir, "[Content_Types].xml")
    with open(ct_file, "r", encoding="utf-8") as f:
        ct_content = f.read()
    if 'Extension="svg"' not in ct_content:
        insert_str = '<Default Extension="svg" ContentType="image/svg+xml"/>'
        ct_content = ct_content.replace('</Types>', f'{insert_str}</Types>')
    with open(ct_file, "w", encoding="utf-8") as f:
        f.write(ct_content)

    final_docx = os.path.join(tempfile.gettempdir(), f"export_{uuid.uuid4().hex}.docx")
    with zipfile.ZipFile(final_docx, 'w', zipfile.ZIP_DEFLATED) as zipf:
        for root, dirs, files in os.walk(extract_dir):
            for file in files:
                file_path = os.path.join(root, file)
                arcname = os.path.relpath(file_path, extract_dir)
                zipf.write(file_path, arcname)

    shutil.rmtree(temp_dir)
    return final_docx
