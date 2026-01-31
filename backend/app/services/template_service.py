"""
Template Service

Business logic for Templates Management Module.
Handles CRUD operations, permission checks, and tree building.
"""
from typing import List, Dict, Any, Optional, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import or_

from app.models.template import (
    Template, TemplateFolder, TemplatePermission, TemplatePermissionLevel
)
from app.models.user import User, Role


class TemplateService:
    """
    Service for managing templates and folders.
    
    Implements permission-based access control at the folder level.
    """
    
    def get_user_permission(
        self, 
        user_id: int, 
        folder_id: str, 
        db: Session
    ) -> Optional[TemplatePermissionLevel]:
        """
        Get the effective permission level for a user on a folder.
        
        Checks both user-specific and role-based permissions.
        DENY takes precedence, then WRITE, then READ.
        
        Args:
            user_id: The user's ID
            folder_id: The folder ID to check
            db: Database session
            
        Returns:
            The permission level, or None if no permission found
        """
        # Get user's roles
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            return None
        
        role_ids = [role.id for role in user.roles]
        
        # Query permissions for this folder
        permissions = db.query(TemplatePermission).filter(
            TemplatePermission.folder_id == folder_id,
            or_(
                TemplatePermission.user_id == user_id,
                TemplatePermission.role_id.in_(role_ids) if role_ids else False
            )
        ).all()
        
        if not permissions:
            # Check parent folder for inherited permissions
            folder = db.query(TemplateFolder).filter(
                TemplateFolder.id == folder_id
            ).first()
            if folder and folder.parent_id:
                return self.get_user_permission(user_id, folder.parent_id, db)
            return None
        
        # DENY takes precedence
        for perm in permissions:
            if perm.permission == TemplatePermissionLevel.DENY:
                return TemplatePermissionLevel.DENY
        
        # WRITE takes precedence over READ
        for perm in permissions:
            if perm.permission == TemplatePermissionLevel.WRITE:
                return TemplatePermissionLevel.WRITE
        
        # Default to READ if any permission exists
        return TemplatePermissionLevel.READ
    
    def check_permission(
        self, 
        user_id: int, 
        folder_id: str, 
        required: TemplatePermissionLevel, 
        db: Session
    ) -> bool:
        """
        Check if user has the required permission level.
        
        Args:
            user_id: The user's ID
            folder_id: The folder ID
            required: The required permission level (READ or WRITE)
            db: Database session
            
        Returns:
            True if user has required permission, False otherwise
        """
        # Admins have full access
        user = db.query(User).filter(User.id == user_id).first()
        if user:
            for role in user.roles:
                if role.name == "Admin":
                    return True
        
        permission = self.get_user_permission(user_id, folder_id, db)
        
        if permission == TemplatePermissionLevel.DENY:
            return False
        
        if required == TemplatePermissionLevel.READ:
            return permission in [
                TemplatePermissionLevel.READ, 
                TemplatePermissionLevel.WRITE
            ]
        
        if required == TemplatePermissionLevel.WRITE:
            return permission == TemplatePermissionLevel.WRITE
        
        return False
    
    def get_tree(
        self, 
        user_id: int, 
        db: Session
    ) -> List[Dict[str, Any]]:
        """
        Build folder/template tree filtered by user permissions.
        
        Returns hierarchical structure with folders and templates
        the user has access to (READ or WRITE permission).
        Admins see all folders regardless of permissions.
        """
        # Check if user is admin
        user = db.query(User).filter(User.id == user_id).first()
        is_admin = False
        if user:
            is_admin = any(role.name == "Admin" for role in user.roles)
        
        # Get all folders
        folders = db.query(TemplateFolder).all()
        
        # Filter by permissions and build tree
        result = []
        folder_map = {}
        
        # First pass: filter folders by permission (or include all for admins)
        accessible_folders = []
        for folder in folders:
            if is_admin:
                # Admins see all folders with WRITE permission
                folder_map[folder.id] = {
                    "id": folder.id,
                    "name": folder.name,
                    "path": folder.path,
                    "type": "folder",
                    "parent_id": folder.parent_id,
                    "permission": "WRITE",
                    "children": [],
                    "templates": []
                }
                accessible_folders.append(folder)
            else:
                permission = self.get_user_permission(user_id, folder.id, db)
                if permission and permission != TemplatePermissionLevel.DENY:
                    folder_map[folder.id] = {
                        "id": folder.id,
                        "name": folder.name,
                        "path": folder.path,
                        "type": "folder",
                        "parent_id": folder.parent_id,
                        "permission": permission.value,
                        "children": [],
                        "templates": []
                    }
                    accessible_folders.append(folder)
        
        # Add templates to their folders
        for folder in accessible_folders:
            templates = db.query(Template).filter(
                Template.folder_id == folder.id
            ).all()
            for template in templates:
                folder_map[folder.id]["templates"].append({
                    "id": template.id,
                    "name": template.name,
                    "path": template.path,
                    "type": "template",
                    "last_modified": template.last_modified.isoformat() 
                        if template.last_modified else None
                })
        
        # Build hierarchy
        for folder_id, folder_data in folder_map.items():
            parent_id = folder_data["parent_id"]
            if parent_id and parent_id in folder_map:
                folder_map[parent_id]["children"].append(folder_data)
            else:
                result.append(folder_data)
        
        # Also get root-level templates (no folder)
        # Admins see all, others only see their own or public
        if is_admin:
            root_templates = db.query(Template).filter(
                Template.folder_id.is_(None)
            ).all()
        else:
            root_templates = db.query(Template).filter(
                Template.folder_id.is_(None)
            ).all()
        
        for template in root_templates:
            result.append({
                "id": template.id,
                "name": template.name,
                "path": template.path,
                "type": "template",
                "last_modified": template.last_modified.isoformat() 
                    if template.last_modified else None
            })
        
        return result
    
    def create_folder(
        self, 
        name: str, 
        parent_id: Optional[str], 
        user_id: int, 
        db: Session
    ) -> TemplateFolder:
        """
        Create a new folder.
        
        Requires WRITE permission on parent folder.
        """
        # Build path
        if parent_id:
            parent = db.query(TemplateFolder).filter(
                TemplateFolder.id == parent_id
            ).first()
            if not parent:
                raise ValueError("Parent folder not found")
            path = f"{parent.path}/{name}"
        else:
            path = f"/{name}"
        
        # Check for duplicate path
        existing = db.query(TemplateFolder).filter(
            TemplateFolder.path == path
        ).first()
        if existing:
            raise ValueError(f"A folder with name '{name}' already exists")
        
        folder = TemplateFolder(
            name=name,
            path=path,
            parent_id=parent_id,
            created_by=user_id
        )
        db.add(folder)
        db.commit()
        db.refresh(folder)
        return folder
    
    def create_template(
        self, 
        name: str, 
        folder_id: Optional[str], 
        content: str, 
        user_id: int, 
        db: Session
    ) -> Template:
        """
        Create a new template.
        
        Requires WRITE permission on parent folder.
        """
        # Build path
        if folder_id:
            folder = db.query(TemplateFolder).filter(
                TemplateFolder.id == folder_id
            ).first()
            if not folder:
                raise ValueError("Folder not found")
            path = f"{folder.path}/{name}.md"
        else:
            path = f"/{name}.md"
        
        template = Template(
            name=name,
            path=path,
            content=content,
            folder_id=folder_id,
            created_by=user_id
        )
        db.add(template)
        db.commit()
        db.refresh(template)
        return template
    
    def update_template(
        self, 
        template_id: str, 
        name: Optional[str] = None, 
        content: Optional[str] = None, 
        structure: Optional[List[Dict[str, Any]]] = None,
        db: Session = None
    ) -> Template:
        """Update an existing template."""
        template = db.query(Template).filter(
            Template.id == template_id
        ).first()
        if not template:
            raise ValueError("Template not found")
        
        if name:
            template.name = name
            # Update path if name changed
            if template.folder_id:
                folder = db.query(TemplateFolder).filter(
                    TemplateFolder.id == template.folder_id
                ).first()
                template.path = f"{folder.path}/{name}.md"
            else:
                template.path = f"/{name}.md"
        
        if content is not None:
            template.content = content

        if structure is not None:
            template.structure = structure
        
        db.commit()
        db.refresh(template)
        return template
    
    def delete_template(self, template_id: str, db: Session) -> bool:
        """Delete a template."""
        template = db.query(Template).filter(
            Template.id == template_id
        ).first()
        if not template:
            return False
        
        db.delete(template)
        db.commit()
        return True
    
    def delete_folder(self, folder_id: str, db: Session) -> bool:
        """
        Delete a folder.
        
        Folder must be empty (no templates or child folders).
        """
        folder = db.query(TemplateFolder).filter(
            TemplateFolder.id == folder_id
        ).first()
        if not folder:
            return False
        
        # Check if folder has templates
        templates_count = db.query(Template).filter(
            Template.folder_id == folder_id
        ).count()
        if templates_count > 0:
            raise ValueError("Folder is not empty - contains templates")
        
        # Check if folder has children
        children_count = db.query(TemplateFolder).filter(
            TemplateFolder.parent_id == folder_id
        ).count()
        if children_count > 0:
            raise ValueError("Folder is not empty - contains subfolders")
        
        db.delete(folder)
        db.commit()
        return True
    
    def render_preview(
        self, 
        yaml_content: str, 
        markdown_content: str
    ) -> str:
        """
        Render HTML preview from YAML styles and markdown content.
        
        Applies YAML styles as inline CSS to the markdown-rendered HTML.
        """
        import markdown
        import yaml
        
        # Parse YAML for styles
        try:
            styles = yaml.safe_load(yaml_content) or {}
        except yaml.YAMLError:
            styles = {}
        
        # Generate CSS from YAML
        css_rules = []
        style_map = {
            "page_size": "@page {{ size: {}; }}",
            "page_margin": "@page {{ margin: {}; }}",
            "h1_font": "h1 {{ font-family: {}; }}",
            "h1_color": "h1 {{ color: {}; }}",
            "h1_size": "h1 {{ font-size: {}; }}",
            "h1_bold": "h1 {{ font-weight: {}; }}",
            "h2_font": "h2 {{ font-family: {}; }}",
            "h2_color": "h2 {{ color: {}; }}",
            "h2_size": "h2 {{ font-size: {}; }}",
            "h3_font": "h3 {{ font-family: {}; }}",
            "h3_color": "h3 {{ color: {}; }}",
            "body_font": "p, body {{ font-family: {}; }}",
            "body_size": "p, body {{ font-size: {}; }}",
            "body_color": "p, body {{ color: {}; }}",
            "quote_bg_color": "blockquote {{ background-color: {}; padding: 1em; }}",
            "quote_border": "blockquote {{ border-left: {}; }}",
            "quote_color": "blockquote {{ color: {}; }}",
            "code_bg_color": "code, pre {{ background-color: {}; padding: 0.5em; }}",
            "code_color": "code, pre {{ color: {}; }}",
            "list_font": "ul, ol, li {{ font-family: {}; }}",
        }
        
        for key, value in styles.items():
            if key in style_map:
                if key.endswith("_bold"):
                    value = "bold" if value else "normal"
                css_rules.append(style_map[key].format(value))
        
        css = "\n".join(css_rules)
        
        # Convert markdown to HTML
        html_body = markdown.markdown(
            markdown_content, 
            extensions=["tables", "fenced_code"]
        )
        
        # Combine into full HTML
        html = f"""<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        body {{ font-family: Arial, sans-serif; padding: 2em; }}
        {css}
    </style>
</head>
<body>
{html_body}
</body>
</html>"""
        
        return html
    
    async def generate_template(
        self, 
        description: str, 
        llm_model: str = "default"
    ) -> str:
        """
        Generate a template using LLM from natural language description.
        
        Returns complete markdown with YAML frontmatter.
        """
        from app.services.llm_service import llm_service
        from app.models.chat import Message
        
        system_prompt = """You are a Template Generator. Create a valid Markdown file with YAML Frontmatter for a "Smart Template" engine.

Rules:
1. Start with YAML Frontmatter (between ---) containing style definitions:
   - h1_font, h1_color, h2_font, h2_color, body_font, quote_bg_color, etc.
   - Use appropriate hex color codes based on the user's theme description.

2. After the frontmatter, create the Markdown structure.

3. Available Syntax & Features:

   a. **Sections & Headers**: Use #, ##, ### for structure.

   b. **Instructions (Dynamic Content)**:
      Use `<!-- INSTRUCTION: Describe what to generate -->` for content that the AI should generate during execution.
      Example: `<!-- INSTRUCTION: Summarize the key findings from the provided documents. -->`

   c. **Static Text**:
      Write normal text for content that should always appear exactly as written (e.g., table headers, disclaimers, labels).
      Example: `**Disclaimer:** This report is computer-generated.`

   d. **Logic & Control Flow** (Jinja2-style):
      - **IF/ELSE**: `{% if condition %}` ... `{% endif %}`
      - **LOOPS**: `{% for item in items %}` ... `{% endfor %}`
      - Use these to structure complex templates (e.g., iterating over a list of findings).

   e. **Variables**:
      You can reference variables using `{{ variable_name }}` if applicable, though primarily use Instructions for generation.

4. Design Best Practices:
   - Use the user's description to determine the Theme (Colors/Fonts).
   - Create a clean, professional layout.
   - Use tables for structured data (with static headers and dynamic rows).

Example Output:
---
h1_font: "Inter"
h1_color: "#1e293b"
---
# {{ Report Title }}

## Executive Summary
<!-- INSTRUCTION: Write a high-level summary of the analysis. -->

## Detailed Findings
| Category | Observation | Impact |
|----------|-------------|--------|
<!-- INSTRUCTION: improved the instruction to generate table rows regarding findings -->
{% for finding in findings %}
| {{ finding.category }} | {{ finding.observation }} | {{ finding.impact }} |
{% endfor %}

**Note:** This section is confidential.
"""
        
        messages = [
            Message(role="system", content=system_prompt),
            Message(role="user", content=f"Create a template for: {description}")
        ]
        
        result = await llm_service.chat(messages, model_name=llm_model)
        return result

    async def optimize_prompt(
        self,
        text: str,
        context_type: str = "instruction",
        llm_model: str = "default"
    ) -> str:
        """
        Optimize a valid user prompt/instruction for LLM consumption.
        """
        from app.services.llm_service import llm_service
        from app.models.chat import Message

        system_prompt = f"""You are an Expert Prompt Engineer. 
Your task is to take a rough draft of a {context_type} and rewrite it into a clear, precise, and effective prompt for an LLM.

Rules:
1. Keep it concise but specific.
2. Use imperative language (e.g., "Analyze...", "Summarize...", "List...").
3. If the input is vague, make reasonable assumptions to improve it, or retain the core intent but structure it better.
4. Do NOT add conversational filler ("Here is the optimized prompt"). JUST return the optimized text.
"""
        
        messages = [
            Message(role="system", content=system_prompt),
            Message(role="user", content=f"Refine this {context_type}: {text}")
        ]

        result = await llm_service.chat(messages, model_name=llm_model)
        return result.strip()



# Singleton instance
template_service = TemplateService()
