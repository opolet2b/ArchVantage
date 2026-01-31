
import sys
import os
import re
import uuid
import json
from typing import List, Dict, Any

# Add backend to path
sys.path.append(os.path.join(os.getcwd(), 'backend'))

from sqlalchemy import create_engine, MetaData, Table, select, update
from sqlalchemy.orm import sessionmaker
from app.core.config import settings

# Logic to parse Markdown (Same as before)
def parse_markdown_to_blocks(markdown: str) -> List[Dict[str, Any]]:
    if not markdown:
        return []
        
    lines = markdown.split('\n')
    root = []
    # Stack items: {'block': block_dict_or_None, 'list': children_list}
    stack = [{'block': None, 'list': root}]
    
    instruction_regex = re.compile(r'<!--\s*INSTRUCTION:\s*(.*?)\s*-->', re.IGNORECASE)
    begin_loop_regex = re.compile(r'<!--\s*BEGIN LOOP:\s*(.*?)\s*-->', re.IGNORECASE)
    end_loop_regex = re.compile(r'<!--\s*END LOOP\s*-->', re.IGNORECASE)
    if_regex = re.compile(r'<!--\s*IF:\s*(.*?)\s*-->', re.IGNORECASE)
    else_regex = re.compile(r'<!--\s*ELSE\s*-->', re.IGNORECASE)
    end_if_regex = re.compile(r'<!--\s*ENDIF\s*-->', re.IGNORECASE)
    header_regex = re.compile(r'^(#{1,6})\s+(.*)')
    
    for line in lines:
        line_content = line.strip()
        if not line_content:
            continue
            
        current_context = stack[-1]
        current_list = current_context['list']
        
        # 1. Loop Start
        loop_start_match = begin_loop_regex.search(line_content)
        if loop_start_match:
            new_loop = {
                "id": str(uuid.uuid4()),
                "type": "loop",
                "loopSource": loop_start_match.group(1).strip(),
                "children": []
            }
            current_list.append(new_loop)
            stack.append({'block': new_loop, 'list': new_loop['children']})
            continue
            
        # 2. Loop End
        if end_loop_regex.search(line_content):
            # Find nearest loop in stack
            loop_index = -1
            for i in range(len(stack) - 1, -1, -1):
                if stack[i]['block'] and stack[i]['block'].get('type') == 'loop':
                    loop_index = i
                    break
            
            if loop_index > 0:
                del stack[loop_index:]
            continue
            
        # 3. IF Start
        if_match = if_regex.search(line_content)
        if if_match:
            new_if = {
                "id": str(uuid.uuid4()),
                "type": "if",
                "content": if_match.group(1).strip(),
                "children": []
            }
            current_list.append(new_if)
            stack.append({'block': new_if, 'list': new_if['children']})
            continue

        # 4. ELSE
        if else_regex.search(line_content):
            # Check if inside IF
            if_index = -1
            for i in range(len(stack) - 1, -1, -1):
                if stack[i]['block'] and stack[i]['block'].get('type') == 'if':
                    if_index = i
                    break
            
            if if_index > 0:
                del stack[if_index:]
                new_else = {
                    "id": str(uuid.uuid4()),
                    "type": "else",
                    "children": []
                }
                stack[-1]['list'].append(new_else)
                stack.append({'block': new_else, 'list': new_else['children']})
            continue

        # 5. ENDIF
        if end_if_regex.search(line_content):
            target_index = -1
            for i in range(len(stack) - 1, -1, -1):
                b = stack[i]['block']
                if b and (b.get('type') == 'if' or b.get('type') == 'else'):
                    target_index = i
                    break
            
            if target_index > 0:
                del stack[target_index:]
            continue

        # 6. Section (Header)
        header_match = header_regex.match(line_content)
        if header_match:
            del stack[1:]
            new_section = {
                "id": str(uuid.uuid4()),
                "type": "section",
                "title": header_match.group(2).strip(),
                "children": []
            }
            root.append(new_section)
            stack.append({'block': new_section, 'list': new_section['children']})
            continue

        # 7. Instruction
        instruction_match = instruction_regex.search(line_content)
        if instruction_match:
            current_list.append({
                "id": str(uuid.uuid4()),
                "type": "instruction",
                "content": instruction_match.group(1).strip()
            })
            continue

        # 8. Text
        current_list.append({
            "id": str(uuid.uuid4()),
            "type": "text",
            "content": line 
        })
        
    return root

def backfill():
    # Detect DB
    if "sqlite" in settings.DATABASE_URL and "sql_app.db" in settings.DATABASE_URL:
        # Check backend/db/sql_app.db
        backend_db = os.path.join(os.getcwd(), 'backend', 'db', 'sql_app.db')
        if os.path.exists(backend_db):
            print(f"Found database at: {backend_db}")
            settings.DATABASE_URL = f"sqlite:///{backend_db}"

    print(f"Connecting to: {settings.DATABASE_URL}")
    engine = create_engine(settings.DATABASE_URL)
    
    # Use reflection instead of ORM Model to avoid conflicts
    metadata = MetaData()
    metadata.reflect(bind=engine)
    
    if 'templates' not in metadata.tables:
        print("Error: 'templates' table not found in database.")
        return

    templates_table = metadata.tables['templates']
    
    with engine.connect() as conn:
        # Select all templates
        stmt = select(templates_table.c.id, templates_table.c.name, templates_table.c.content, templates_table.c.structure)
        result = conn.execute(stmt)
        rows = result.fetchall()
        
        print(f"Found {len(rows)} templates.")
        count = 0
        
        for row in rows:
            t_id = row.id
            t_name = row.name
            t_content = row.content
            t_structure = row.structure
            
            if not t_structure and t_content:
                print(f"Backfilling structure for: {t_name}")
                try:
                    blocks = parse_markdown_to_blocks(t_content)
                    
                    # Update query
                    update_stmt = (
                        update(templates_table)
                        .where(templates_table.c.id == t_id)
                        .values(structure=blocks) # SQLAlchemy handles JSON serialization
                    )
                    conn.execute(update_stmt)
                    count += 1
                except Exception as e:
                    print(f"Error parsing/updating template {t_name}: {e}")
            else:
                 print(f"Skipping {t_name} (Structure exists or Content empty)")
        
        if count > 0:
            conn.commit()
            print(f"Successfully backfilled {count} templates.")
        else:
            print("No templates needed backfilling.")

if __name__ == "__main__":
    backfill()
