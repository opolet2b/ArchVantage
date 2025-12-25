"""
Prompt Service

Core service for managing prompts.
- Syncs code-definitions to DB on startup.
- Resolves prompts at runtime using Dual-Mode logic (f-string vs Jinja2).
"""
import logging
from typing import Dict, Any, List, Optional
from sqlalchemy.orm import Session
from jinja2 import Template
from app.core.database import SessionLocal
from app.models.prompt_models import PromptRegistry, PromptOverride
from app.schemas.prompt_schemas import PromptDefinition

logger = logging.getLogger(__name__)

class PromptService:
    def __init__(self):
        self._registry_cache: Dict[str, PromptDefinition] = {}

    def register_prompts(self, prompts: List[PromptDefinition]):
        """
        Register a list of prompt definitions from code.
        This updates the internal cache and syncs to the DB.
        """
        db = SessionLocal()
        try:
            for prompt_def in prompts:
                self._registry_cache[prompt_def.key] = prompt_def
                self._sync_definition(db, prompt_def)
            db.commit()
        except Exception as e:
            logger.error(f"Failed to sync prompts: {e}")
            db.rollback()
        finally:
            db.close()

    def _sync_definition(self, db: Session, definition: PromptDefinition):
        """Upsert the definition into prompt_registry table."""
        existing = db.query(PromptRegistry).filter(PromptRegistry.key == definition.key).first()
        if existing:
            # Update fields to match code (Source of Truth)
            existing.group = definition.group
            existing.default_content = definition.default_text
            existing.variables_schema = definition.variables
            existing.description = definition.description
            existing.access_level = definition.access_level
        else:
            # Create new
            new_prompt = PromptRegistry(
                key=definition.key,
                group=definition.group,
                default_content=definition.default_text,
                variables_schema=definition.variables,
                description=definition.description,
                access_level=definition.access_level
            )
            db.add(new_prompt)

    def get_prompt(
        self, 
        key: str, 
        variables: Dict[str, Any] = None, 
        user_id: Optional[int] = None
    ) -> str:
        """
        Get the rendered prompt string.
        
        Dual-Mode Logic:
        1. Check DB for active override (User or Global).
           If found -> Use Jinja2 to render.
        2. Fallback to Registry Cache (Code definition).
           If found -> Use f-string format (**variables).
        """
        if variables is None:
            variables = {}

        # 1. Check for Overrides
        try:
            override_content = self._get_override_content(key, user_id)
            if override_content:
                # Jinja2 Mode
                return Template(override_content).render(**variables)
        except Exception as e:
            logger.error(f"Error rendering override for {key}: {e}. Falling back to default.")

        # 2. Fallback to Default
        definition = self._registry_cache.get(key)
        if not definition:
            # Emergency: Key not registered? Return safe fallback if possible or empty
            logger.warning(f"Prompt key '{key}' not found in registry cache.")
            return f"Error: Prompt {key} not found."

        # f-string Mode (Safety Net)
        try:
            return definition.default_text.format(**variables)
        except KeyError as e:
             # This happens if code variables changed but prompt didn't update?
             # Or if caller forgot variables.
             logger.error(f"Missing variable for f-string fallback {key}: {e}")
             return definition.default_text # Return raw template as last resort

    def _get_override_content(self, key: str, user_id: Optional[int]) -> Optional[str]:
        """
        Fetch active override from DB.
        Prioritizes User Specific > Global Admin.
        """
        db = SessionLocal()
        try:
            # 1. User Specific
            if user_id:
                user_override = db.query(PromptOverride).filter(
                    PromptOverride.prompt_key == key,
                    PromptOverride.user_id == user_id,
                    PromptOverride.is_active == True
                ).first()
                if user_override:
                    return user_override.content

            # 2. Global Admin
            admin_override = db.query(PromptOverride).filter(
                PromptOverride.prompt_key == key,
                PromptOverride.user_id == None,
                PromptOverride.is_active == True
            ).first()
            
            if admin_override:
                return admin_override.content
            
            return None
        finally:
            db.close()
    
    def get_definition(self, key: str) -> Optional[PromptDefinition]:
        return self._registry_cache.get(key)
        
    def get_all_definitions(self) -> List[PromptDefinition]:
        return list(self._registry_cache.values())

# Global Instance
prompt_service = PromptService()
